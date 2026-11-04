#!/usr/bin/env bash
# Deploys a backend image on the VM: pull, migrate, then swap the running container for the new one with no gap.
#
#   ./deploy.sh ghcr.io/<owner>/bookanything-backend@sha256:<digest>
#   ./deploy.sh            the image running now, again: applies changed settings in backend.env without a gap
#
# update.sh runs it when the environment's image tag moves (docs/deployment.md). Run from the deploy directory (compose.yml, .env, backend.env, migrate.env). Migrations are never
# rolled back, so a migration must keep working with the release before it (add, backfill, switch, then drop in a later
# release).
#
# The swap: a second backend container starts from the new image beside the old one. Both answer to the name `backend`
# on the Docker network, so cloudflared sends new connections to either as soon as the new one listens (Ktor listens
# only once the app is wired up; a release that listens but serves errors gets that share until the health check
# fails it, at most HEALTH_TIMEOUT). Once the new one is healthy, the old one gets SIGTERM, finishes its in-flight
# requests (15 s, Application.kt) and exits; connections refused while it stops move to the new one. If anything fails
# before the old one is stopped, .env is put back and the new container removed: the old one never noticed.
set -euo pipefail

cd "$(dirname "$0")"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

# As the deploy directory's owner (the `deploy` user): files written as anyone else would lock the updater out.
[[ -O . ]] || { echo "run as the owner of $PWD: sudo -u $(stat -c %U . 2> /dev/null || echo deploy) $0 ..." >&2; exit 77; }
for file in compose.yml .env backend.env migrate.env; do
  [[ -f "$file" ]] || { echo "missing $PWD/$file (see docs/deployment.md)" >&2; exit 66; }
done
# No image: the one running again, which is how changed settings in backend.env take effect.
IMAGE="${1:-$(grep '^BACKEND_IMAGE=' .env | tail -n 1 | cut -d= -f2- || true)}"
[[ -n "$IMAGE" ]] || { echo "usage: $0 [backend image] (nothing runs yet, so name one)" >&2; exit 64; }

log() { printf '%s deploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Rewrites one KEY=value line of .env (added if missing), keeping the file's mode.
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp .env.XXXXXX)"
  grep -v "^${key}=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod --reference=.env "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" .env
}

health_of() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1"; }

wait_healthy() {
  local id="$1" waited=0 status
  while (( waited < HEALTH_TIMEOUT )); do
    status="$(health_of "$id")"
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead) break ;;
    esac
    sleep 2
    waited=$(( waited + 2 ))
  done
  log "container ${id:0:12} is ${status:-not healthy} after ${waited}s; its last log lines:"
  docker logs --tail 50 "$id" >&2 || true
  return 1
}

previous="$(grep '^BACKEND_IMAGE=' .env | cut -d= -f2- || true)"   # empty on a first deploy
new_id=""
committed=false
# Until the new container has taken over, any way out (a failed step, an error, a signal) puts .env back and removes
# a new container that never took over: the running release keeps serving as if nothing had happened.
back_out() {
  if ! $committed; then
    [[ -n "$new_id" ]] && docker rm -f "$new_id" > /dev/null 2>&1
    # Even when it was empty: .env must never name an image that is not running.
    set_env BACKEND_IMAGE "$previous"
  fi
  return 0
}
trap back_out EXIT

log "pulling $IMAGE"
docker pull --quiet "$IMAGE"

set_env BACKEND_IMAGE "$IMAGE"

log "applying migrations"
if ! docker compose run --rm --no-deps migrate; then
  log "migrations failed; the running release is untouched"
  exit 1
fi

# Recreated only when its settings changed (a new pin or token).
docker compose up -d cloudflared

old_ids="$(docker compose ps -q backend)"
if [[ -z "$old_ids" ]]; then
  log "first start"
  docker compose up -d --no-deps backend
  new_id="$(docker compose ps -q backend)"
  wait_healthy "$new_id" || exit 1
else
  # One more than are running now (normally one; more if an earlier deploy was interrupted mid-swap).
  count="$(wc -l <<< "$old_ids")"
  log "starting the new backend beside ${old_ids//$'\n'/ }"
  docker compose up -d --no-deps --no-recreate --scale "backend=$(( count + 1 ))" backend
  new_id="$(docker compose ps -q backend | grep -v -F "$old_ids" | head -n 1 || true)"
  if [[ -z "$new_id" ]] || ! wait_healthy "$new_id"; then
    log "the new backend did not become healthy; keeping the old one"
    exit 1
  fi
  log "new backend ${new_id:0:12} is healthy; stopping the old one"
  committed=true
  # shellcheck disable=SC2086 # one id per word
  docker stop --time 20 $old_ids > /dev/null
  # shellcheck disable=SC2086
  docker rm $old_ids > /dev/null
fi
committed=true

printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$IMAGE" >> .deploy-history
# Old images can always be pulled again for a rollback; keep the disk from filling up.
docker image prune --all --force --filter "until=336h" > /dev/null || true
log "deployed $IMAGE"
