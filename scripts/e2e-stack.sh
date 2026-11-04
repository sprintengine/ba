#!/usr/bin/env bash
# An isolated end-to-end stack next to a developer's own servers: a fresh database, the backend built from this
# checkout on its own port, and a production frontend build (with the /dev routes) on another port.
#
#   scripts/e2e-stack.sh up      # build, migrate + seed a fresh database, start both servers
#   scripts/e2e-stack.sh backend # the same without the frontend (the simulation talks to the API only)
#   scripts/e2e-stack.sh backend-down  # stop the backend only and drop the database (after `backend`)
#   scripts/e2e-stack.sh frontend  # rebuild and restart only the frontend (after frontend changes)
#   scripts/e2e-stack.sh test    # run Playwright against it (extra args go to playwright, e.g. --repeat-each 1)
#   scripts/e2e-stack.sh down    # stop both servers and drop the database
#
# Nothing here touches the developer's backend (:8080, backend/build/install) or `next dev` (:3000): the backend
# runs from its own unpacked distribution and the frontend from `next start`. The backend is development-only
# (dev auth, the scripted fake model, dev payments) with RATE_LIMIT_MULTIPLIER so repeated runs through one
# address are not rate limited (refused outside APP_ENV=development).
#
# Settings (env): E2E_DB (bookanything_e2e), E2E_BACKEND_PORT (8095), E2E_FRONTEND_PORT (3002),
# E2E_STACK_DIR (/tmp/bookanything-e2e), E2E_RATE_LIMIT_MULTIPLIER (50). Needs createdb/dropdb/psql on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${E2E_DB:-bookanything_e2e}"
BACKEND_PORT="${E2E_BACKEND_PORT:-8095}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-3002}"
STACK="${E2E_STACK_DIR:-/tmp/bookanything-e2e}"
MULTIPLIER="${E2E_RATE_LIMIT_MULTIPLIER:-50}"

backend_env() {
  export APP_ENV=development AUTH_MODE=dev AI_FAKE_SCRIPT=demo
  export DATABASE_URL="jdbc:postgresql://localhost:5432/$DB"
  export PORT="$BACKEND_PORT" APP_BASE_URL="http://localhost:$FRONTEND_PORT"
  export RATE_LIMIT_MULTIPLIER="$MULTIPLIER"
}

wait_for() { # url, what
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$1" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "$2 did not come up at $1" >&2
  return 1
}

stop() { # pid file, port: the process we started, then whatever of ours still listens on that port only
  if [[ -f "$1" ]]; then
    local pid
    pid="$(cat "$1")"
    if kill -0 "$pid" 2>/dev/null; then kill "$pid"; fi
    rm -f "$1"
  fi
  local left
  left="$(lsof -t -iTCP:"$2" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$left" ]]; then kill $left; fi
}

backend_up() {
  mkdir -p "$STACK"
  echo "Building the backend distribution..."
  (cd "$ROOT" && ./gradlew -q :backend:distTar)
  rm -rf "$STACK/backend" && mkdir -p "$STACK/backend"
  tar -xf "$ROOT"/backend/build/distributions/backend-*.tar -C "$STACK/backend" --strip-components 1

  echo "Fresh database $DB..."
  dropdb --if-exists "$DB"
  createdb "$DB"
  (backend_env && "$STACK/backend/bin/backend" seed-demo > "$STACK/seed.log" 2>&1)

  echo "Backend on :$BACKEND_PORT..."
  (backend_env && cd "$ROOT" && nohup "$STACK/backend/bin/backend" > "$STACK/backend.log" 2>&1 & echo $! > "$STACK/backend.pid")
  wait_for "http://localhost:$BACKEND_PORT/v1/health" "The backend"
}

up() {
  backend_up
  frontend_up
  echo "Stack is up: http://localhost:$FRONTEND_PORT (logs in $STACK)"
}

frontend_up() {
  mkdir -p "$STACK"
  echo "Frontend production build..."
  (cd "$ROOT/frontend" && BACKEND_ORIGIN="http://localhost:$BACKEND_PORT" NEXT_PUBLIC_ENABLE_DEV_ROUTES=true \
    npm run build > "$STACK/build.log" 2>&1) || { tail -40 "$STACK/build.log"; exit 1; }
  echo "Frontend on :$FRONTEND_PORT..."
  (cd "$ROOT/frontend" && BACKEND_ORIGIN="http://localhost:$BACKEND_PORT" nohup node_modules/.bin/next start -p "$FRONTEND_PORT" \
    > "$STACK/frontend.log" 2>&1 & echo $! > "$STACK/frontend.pid")
  wait_for "http://localhost:$FRONTEND_PORT/" "The frontend"
}

run_tests() {
  cd "$ROOT/frontend"
  E2E_BASE_URL="http://localhost:$FRONTEND_PORT" npx playwright test "$@"
}

down() {
  stop "$STACK/frontend.pid" "$FRONTEND_PORT"
  stop "$STACK/backend.pid" "$BACKEND_PORT"
  dropdb --if-exists "$DB" || true
  echo "Stack is down."
}

backend_down() {
  stop "$STACK/backend.pid" "$BACKEND_PORT"
  dropdb --if-exists "$DB" || true
  echo "Backend is down."
}

case "${1:-}" in
  up) up ;;
  backend) backend_up; echo "Backend is up: http://localhost:$BACKEND_PORT (logs in $STACK)" ;;
  frontend) stop "$STACK/frontend.pid" "$FRONTEND_PORT"; frontend_up ;;
  test) shift; run_tests "$@" ;;
  backend-down) backend_down ;;
  down) down ;;
  *) echo "usage: $0 up|backend|frontend|test|backend-down|down" >&2; exit 2 ;;
esac
