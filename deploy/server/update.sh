#!/usr/bin/env bash
# Pull-based deploys: moving the environment's image tag is the deploy (docs/deployment.md, docs/releases.md).
#
# Run every minute by bookanything-update.timer. It pulls BACKEND_REPOSITORY:TRACK (TRACK is `staging` or
# `production`, both in .env) and, when that tag names a different image than the one running, takes the deploy
# files that ship inside that image (compose.yml, deploy.sh and this script, under /app/deploy) and runs deploy.sh on
# the image's digest: migrations first, then a second container beside the running one, which is stopped only once
# the new one is healthy. A release that fails (migrations, or a container that never turns healthy) leaves the
# running one serving, puts back the previous deploy files and is remembered in .failed-image, so it is not retried
# every minute: the next deploy is the tag moving again. Nothing here needs a credential: the images are public.
#
#   ./update.sh            what the timer runs
#   ./update.sh --status   what is running, what the tag names, and the last failure
set -euo pipefail

cd "$(dirname "$0")"

log() { printf '%s update: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
env_value() { grep "^$1=" .env | tail -n 1 | cut -d= -f2- || true; }

[[ -O . ]] || { echo "run as the owner of $PWD: sudo -u $(stat -c %U . 2> /dev/null || echo deploy) $0" >&2; exit 77; }
[[ -f .env ]] || { echo "missing $PWD/.env (see docs/deployment.md)" >&2; exit 66; }
repository="$(env_value BACKEND_REPOSITORY)"
track="$(env_value TRACK)"
# A VM set up but not configured yet (bootstrap.sh leaves both empty) waits quietly.
[[ -n "$repository" && -n "$track" ]] || { log "BACKEND_REPOSITORY and TRACK are not both set in .env; nothing to do"; exit 0; }
[[ "$track" == staging || "$track" == production ]] || { echo "TRACK in .env must be staging or production" >&2; exit 78; }

running="$(env_value BACKEND_IMAGE)"
failed="$(cat .failed-image 2> /dev/null || true)"

if ! docker pull --quiet "$repository:$track" > /dev/null; then
  log "could not pull $repository:$track; the running release is untouched"
  exit 1
fi
# The tag as a digest reference, so what runs never changes under a tag that moves.
wanted="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$repository:$track" |
  grep -m 1 -F "$repository@sha256:" || true)"
[[ -n "$wanted" ]] || { log "$repository:$track has no digest from $repository"; exit 1; }

if [[ "${1:-}" == --status ]]; then
  echo "track:   $repository:$track"
  echo "tag:     $wanted"
  echo "running: ${running:-nothing yet}"
  echo "failed:  ${failed:-none}"
  exit 0
fi

# One deploy at a time: one can outlast the timer's interval. (flock is util-linux, always on the VM.)
if command -v flock > /dev/null; then
  exec 9> .update.lock
  flock -n 9 || { log "another update is running"; exit 0; }
  running="$(env_value BACKEND_IMAGE)"   # it may have just finished
fi

# Nothing new, or the release that already failed here: wait for the tag to move.
[[ "$wanted" == "$running" || "$wanted" == "$failed" ]] && exit 0

log "$repository:$track moved to $wanted (running ${running:-nothing})"

# The deploy files of the release being deployed, swapped in by rename so a running copy of this script is unaffected.
files=(compose.yml deploy.sh update.sh)
staged="$(mktemp -d .incoming.XXXXXX)"
container=""
trap 'rm -rf "$staged"; [[ -z "$container" ]] || docker rm "$container" > /dev/null 2>&1 || true' EXIT
container="$(docker create "$wanted")"
if ! docker cp "$container:/app/deploy/." "$staged/" > /dev/null; then
  log "$wanted carries no /app/deploy; not deploying it"
  echo "$wanted" > .failed-image
  exit 1
fi
docker rm "$container" > /dev/null
container=""
for file in "${files[@]}"; do
  [[ -f "$staged/$file" ]] || { log "$wanted carries no deploy/$file; not deploying it"; echo "$wanted" > .failed-image; exit 1; }
done
for file in "${files[@]}"; do
  [[ -f "$file" ]] && cp -p "$file" "$file.previous"
  chmod "$([[ "$file" == *.sh ]] && echo 755 || echo 644)" "$staged/$file"
  mv -f "$staged/$file" "$file"
done

if ./deploy.sh "$wanted"; then
  rm -f .failed-image
  log "now running $wanted"
else
  log "deploying $wanted failed; the previous release keeps running"
  echo "$wanted" > .failed-image
  for file in "${files[@]}"; do
    [[ -f "$file.previous" ]] && mv -f "$file.previous" "$file"
  done
  exit 1
fi
