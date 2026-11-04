#!/usr/bin/env bash
# Deploys a website build from the release train to one environment's Worker (docs/releases.md): the OpenNext output a
# nightly built for that environment, never rebuilt. Run from the root of a checkout of the same commit (the script
# itself may live elsewhere, as the train's copy does), with frontend/node_modules installed (wrangler, OpenNext's CLI).
#
#   scripts/release/deploy-site.sh staging site-staging.tar.gz
#
# Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, BACKEND_ORIGIN and CLERK_SECRET_KEY for the environment,
# and optionally APPLE_APP_IDS, ANDROID_PACKAGE_NAME, ANDROID_SHA256_FINGERPRINTS (the Worker's runtime vars).
set -euo pipefail

target="${1:?usage: deploy-site.sh <staging|production> <site tarball>}"
tarball="$(cd "$(dirname "${2:?}")" && pwd)/$(basename "$2")"
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${BACKEND_ORIGIN:?}" "${CLERK_SECRET_KEY:?}"
case "$target" in
  production) env_args=(--env "") ;;
  staging) env_args=(--env staging) ;;
  *) echo "unknown environment: $target" >&2; exit 64 ;;
esac

[[ -f frontend/wrangler.jsonc ]] || { echo "run from the repository root (no frontend/wrangler.jsonc in $PWD)" >&2; exit 66; }
cd frontend
rm -rf .open-next
mkdir .open-next
tar -xzf "$tarball" -C .open-next

# The prerendered pages to the environment's cache bucket, then the Worker. wrangler directly (OPEN_NEXT_DEPLOY stops it
# handing over to OpenNext) so the vars and the secret reach it as separate arguments: runtime vars are replaced on every
# deploy, and the secret is uploaded with the version.
npx opennextjs-cloudflare populateCache remote "${env_args[@]}"
secrets="$(mktemp)"
trap 'rm -f "$secrets"' EXIT
jq -n '{CLERK_SECRET_KEY: env.CLERK_SECRET_KEY}' > "$secrets"
vars=(--var "BACKEND_ORIGIN:$BACKEND_ORIGIN")
for name in APPLE_APP_IDS ANDROID_PACKAGE_NAME ANDROID_SHA256_FINGERPRINTS; do
  [[ -z "${!name:-}" ]] || vars+=(--var "$name:${!name}")
done
OPEN_NEXT_DEPLOY=true npx wrangler deploy "${env_args[@]}" --secrets-file "$secrets" "${vars[@]}"
