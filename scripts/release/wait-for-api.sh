#!/usr/bin/env bash
# Waits until an environment's API answers /v1/health with the expected release: the VM's updater deploys within a
# minute or two of the release train moving its image tag (deploy/server/update.sh).
#
#   scripts/release/wait-for-api.sh https://api-staging.example.com 0.4.0-nightly.20261104.17 [timeout seconds]
set -euo pipefail

api="${1:?usage: wait-for-api.sh <api url> <version> [timeout]}"
version="${2:?}"
timeout="${3:-900}"
waited=0
last=""
while (( waited < timeout )); do
  last="$(curl --silent --max-time 10 "${api%/}/v1/health" || true)"
  if [[ "$last" == *'"status":"ok"'* && "$last" == *"\"version\":\"$version\""* ]]; then
    echo "${api%/} runs $version: $last"
    exit 0
  fi
  sleep 15
  waited=$(( waited + 15 ))
done
echo "::error::${api%/} did not report version $version within ${timeout}s (last answer: ${last:-none}). On the VM: journalctl -u bookanything-update" >&2
exit 1
