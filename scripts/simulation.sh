#!/usr/bin/env bash
# The reliability simulation (docs/simulation.md) against an isolated local stack: a fresh database and the backend
# built from this checkout on their own name and port (not those of scripts/e2e-stack.sh's defaults, so both can run),
# the simulation, then the stack torn down again.
#
#   scripts/simulation.sh                                   # 10 minutes at 90 actions a minute
#   scripts/simulation.sh --duration 30m --rate 60 --seed abc
#   scripts/simulation.sh replay --from-log out/sim.jsonl   # paths are relative to simulation/
#
# Arguments go to the simulation (`run` by default, or `replay`). Its log and report land in
# simulation/out/. The checker reads the database directly too (read-only).
#
# Settings (env): SIM_DB (bookanything_sim), SIM_BACKEND_PORT (8097), SIM_STACK_DIR (/tmp/bookanything-sim),
# SIM_RATE_LIMIT_MULTIPLIER (50), SIM_KEEP_STACK=1 to leave the stack up afterwards (stop it with
# `scripts/simulation.sh down`). Needs createdb/dropdb/psql on PATH, like e2e-stack.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export E2E_DB="${SIM_DB:-bookanything_sim}"
export E2E_BACKEND_PORT="${SIM_BACKEND_PORT:-8097}"
# No frontend is started (teardown stops the backend only); this port only names APP_BASE_URL (payment return links).
export E2E_FRONTEND_PORT="${SIM_FRONTEND_PORT:-3007}"
export E2E_STACK_DIR="${SIM_STACK_DIR:-/tmp/bookanything-sim}"
export E2E_RATE_LIMIT_MULTIPLIER="${SIM_RATE_LIMIT_MULTIPLIER:-50}"

if [[ "${1:-}" == "down" ]]; then
  exec "$ROOT/scripts/e2e-stack.sh" backend-down
fi

teardown() {
  if [[ "${SIM_KEEP_STACK:-}" != "1" ]]; then "$ROOT/scripts/e2e-stack.sh" backend-down; fi
}
trap teardown EXIT

"$ROOT/scripts/e2e-stack.sh" backend
if [[ ! -d "$ROOT/simulation/node_modules" ]]; then npm --prefix "$ROOT/simulation" ci; fi

cd "$ROOT/simulation"
SIM_BASE_URL="http://localhost:$E2E_BACKEND_PORT" \
  SIM_APP_URL="http://localhost:$E2E_FRONTEND_PORT" \
  SIM_DATABASE_URL="${SIM_DATABASE_URL:-postgres://localhost:5432/$E2E_DB}" \
  npx tsx src/cli.ts "$@"
