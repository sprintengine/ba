#!/usr/bin/env bash
# Ships a build the release train already made to one environment (docs/releases.md): the Staging and Production jobs
# of .github/workflows/release.yml run it from the train's own checkout (.train), in the candidate's checkout.
#
#   .train/scripts/release/ship.sh staging      # or production
#
# 1. Tags the image digest in images.json with the environment's tag (:staging; :production and :latest) and the
#    version: moving the tag is the backend's deploy, which the environment's VM pulls (deploy/server/update.sh).
# 2. Waits until the environment's API reports that build (when its API URL is set).
# 3. Deploys the environment's website build (site-<environment>.tar.gz) to its Worker and runs the deployed smoke
#    tests (when Cloudflare and the environment's site are set up), and says whether it did in $GITHUB_OUTPUT
#    (site_deployed=true|false).
#
# Environment: IMAGE, VERSION, GHCR_USER, GHCR_TOKEN; API_URL and APP_URL (may be empty); CLOUDFLARE_ACCOUNT_ID,
# CLOUDFLARE_API_TOKEN, BACKEND_ORIGIN, CLERK_SECRET_KEY and the optional app-link vars for the website.
set -euo pipefail

target="${1:?usage: ship.sh <staging|production>}"
: "${IMAGE:?}" "${VERSION:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}"
train="$(cd "$(dirname "$0")" && pwd)"
case "$target" in
  staging) tags=(staging) ;;
  production) tags=(production latest) ;;
  *) echo "unknown environment: $target" >&2; exit 64 ;;
esac
upper="$(tr '[:lower:]' '[:upper:]' <<< "$target")"
output() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "$1" >> "$GITHUB_OUTPUT"; fi; }

digest="$(jq -r .images.backend images.json)"
build="$(jq -r .version images.json)"

# The registry login lives only as long as the retag: nothing after it (npm, Playwright) sees it.
config="$(mktemp -d)"
trap 'rm -rf "$config"' EXIT
args=()
for tag in "${tags[@]}" "$VERSION"; do args+=(-t "${IMAGE}:${tag}"); done
printf '%s' "$GHCR_TOKEN" | DOCKER_CONFIG="$config" docker login ghcr.io -u "$GHCR_USER" --password-stdin > /dev/null
DOCKER_CONFIG="$config" docker buildx imagetools create "${args[@]}" "$digest"
rm -rf "$config"
echo "Tagged $digest as ${tags[*]} and $VERSION."

if [[ -n "${API_URL:-}" ]]; then
  "$train/wait-for-api.sh" "$API_URL" "$build"
else
  echo "::notice::${upper}_API_URL is not set, so nothing checked that the $target VM deployed the image (docs/releases.md)."
fi

site="site-$target.tar.gz"
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${APP_URL:-}" || ! -f "$site" ]]; then
  echo "::notice::The $target website was not deployed: it needs CLOUDFLARE_ACCOUNT_ID, ${upper}_APP_URL and a nightly built with them (docs/releases.md)."
  output site_deployed=false
  exit 0
fi
# Install scripts stay off: nothing a dependency runs at install time sees the Cloudflare or Clerk credentials.
(cd frontend && npm ci --ignore-scripts --no-audit --no-fund)
"$train/deploy-site.sh" "$target" "$site"
unset CLOUDFLARE_API_TOKEN CLERK_SECRET_KEY
(
  cd frontend
  npx playwright install --with-deps chromium
  E2E_BASE_URL="$APP_URL" npx playwright test -c playwright.deployed.config.ts
)
output site_deployed=true
