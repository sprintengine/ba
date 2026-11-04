#!/usr/bin/env bash
# Smoke-tests a backend image the way a VM runs it (docs/releases.md): a throwaway Postgres 16, the application role
# from deploy/sql/app-role.sql, `migrate` as the owner, then the server as the application role with APP_ENV=staging
# (every production rule on), checked through the routes a deploy and the website depend on.
#
#   scripts/release/backend-smoke.sh ghcr.io/<owner>/bookanything-backend@sha256:<digest> [expected version]
#
# Needs Docker. Cleans up after itself.
set -euo pipefail

image="${1:?usage: backend-smoke.sh <image> [expected version]}"
expected_version="${2:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
name="bookanything-smoke-$$"
fail() { echo "::error::backend image smoke: $*" >&2; exit 1; }
cleanup() {
  docker rm -f "$name-api" "$name-db" > /dev/null 2>&1 || true
  docker network rm "$name" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$name" > /dev/null
docker run -d --name "$name-db" --network "$name" -e POSTGRES_DB=bookanything -e POSTGRES_USER=owner \
  -e POSTGRES_PASSWORD=owner postgres:16 > /dev/null
# Over TCP: the image's first-start init server answers on the socket only, and is stopped again before the real one.
ready() { docker exec "$name-db" pg_isready -q -h 127.0.0.1 -U owner -d bookanything; }
for _ in $(seq 1 60); do ready && break; sleep 1; done
ready || fail "Postgres did not start"

sql() { docker exec -i "$name-db" psql -q -X -v ON_ERROR_STOP=1 -U owner -d bookanything "$@"; }
sql -f - < "$root/deploy/sql/app-role.sql" > /dev/null
sql -c "ALTER ROLE bookanything_app PASSWORD 'app'" > /dev/null

common=(--network "$name" -e DATABASE_URL="jdbc:postgresql://$name-db:5432/bookanything")
echo "migrate, as the owner"
docker run --rm "${common[@]}" -e APP_ENV=staging -e DATABASE_USERNAME=owner -e DATABASE_PASSWORD=owner \
  -e TOKEN_SECRET=smoke-test-token-secret-0123456789 -e CLERK_ISSUER=https://clerk.example.com \
  -e CLERK_AUTHORIZED_PARTIES=https://staging.example.com "$image" migrate
sql -f - < "$root/deploy/sql/app-role.sql" > /dev/null

echo "serve, as the application role"
docker run -d --name "$name-api" "${common[@]}" -e APP_ENV=staging -e DATABASE_USERNAME=bookanything_app \
  -e DATABASE_PASSWORD=app -e TOKEN_SECRET=smoke-test-token-secret-0123456789 \
  -e CLERK_ISSUER=https://clerk.example.com -e CLERK_AUTHORIZED_PARTIES=https://staging.example.com \
  -e APP_BASE_URL=https://staging.example.com -e CLIENT_IP_HEADER=CF-Connecting-IP "$image" > /dev/null
for _ in $(seq 1 90); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$name-api" 2> /dev/null || echo gone)"
  [[ "$status" == healthy || "$status" == unhealthy || "$status" == gone ]] && break
  sleep 2
done
if [[ "$status" != healthy ]]; then
  docker logs --tail 80 "$name-api" >&2 || true
  fail "the server is $status, not healthy"
fi

# Inside the container: the image's own wget, the port it listens on.
get() { docker exec "$name-api" wget -q -O - "http://127.0.0.1:8080$1"; }
health="$(get /v1/health)"
echo "health: $health"
[[ "$health" == *'"status":"ok"'* ]] || fail "health is not ok"
if [[ -n "$expected_version" ]]; then
  [[ "$health" == *"\"version\":\"$expected_version\""* ]] || fail "health does not report version $expected_version"
fi
get "/v1/public/marketplace/search?q=physio" > /dev/null || fail "marketplace search failed"
# grep reads everything (no -q): an early exit would fail the pipe under pipefail.
get /.well-known/oauth-authorization-server | grep '"issuer":"https://staging.example.com"' > /dev/null ||
  fail "OAuth metadata is wrong"
docker logs "$name-api" 2>&1 | grep "env=staging" > /dev/null || fail "the server did not start as staging"
[[ "$(docker exec "$name-api" id -u)" != 0 ]] || fail "the server runs as root"
for file in compose.yml deploy.sh update.sh; do
  docker exec "$name-api" test -f "/app/deploy/$file" || fail "the image carries no /app/deploy/$file"
done
if docker logs "$name-api" 2>&1 | grep -E "level=ERROR|permission denied"; then fail "the server logged errors"; fi
echo "backend image smoke passed: $image"
