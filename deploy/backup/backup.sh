#!/usr/bin/env bash
# Dumps the database (pg_dump custom format) and uploads it to an S3-compatible bucket (Cloudflare R2).
#
# Environment:
#   DATABASE_URL                 libpq URL of the database: postgres://owner:pw@host/bookanything?sslmode=require, as a
#                                role that bypasses row-level security (a superuser, or BYPASSRLS like a managed
#                                provider's owner role): the tables force it, and pg_dump refuses to dump them otherwise
#   BACKUP_S3_BUCKET             bucket name
#   BACKUP_S3_ENDPOINT           https://<account id>.r2.cloudflarestorage.com (empty for AWS S3)
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   a token with Object Read & Write on that bucket only
#   BACKUP_PREFIX                folder per environment: production or staging
#
# Writes <prefix>/YYYY/MM/DD/bookanything-<prefix>-<UTC time>.dump and points <prefix>/LATEST at it. The last line
# printed is `uploaded s3://<bucket>/<key>`.
# Retention is the bucket's lifecycle rule (docs/deployment.md), not this script.
set -euo pipefail

: "${DATABASE_URL:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_PREFIX:?}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# R2 rejects the CLI's newer default checksums on some operations; send them only when an API requires them.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
s3() { aws ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} s3 "$@"; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
key="${BACKUP_PREFIX}/$(date -u +%Y/%m/%d)/bookanything-${BACKUP_PREFIX}-${stamp}.dump"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
dump="$work/backup.dump"

# Checked first, so a role that cannot read every row fails here, clearly, rather than half-way through the dump.
if [[ "$(psql "$DATABASE_URL" -XAtq -c "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")" != t ]]; then
  echo "the role in DATABASE_URL neither is a superuser nor has BYPASSRLS: pg_dump cannot read tables that force row-level security" >&2
  exit 1
fi

echo "dumping"
pg_dump --format=custom --compress=6 --no-password --file="$dump" "$DATABASE_URL"
# A dump whose table of contents can't be read is not a backup.
entries="$(pg_restore --list "$dump" | grep -c -v '^;')"
size="$(wc -c < "$dump" | tr -d ' ')"
echo "dump ok: $entries entries, $size bytes"

s3 cp --only-show-errors "$dump" "s3://$BACKUP_S3_BUCKET/$key"
printf '%s\n' "$key" > "$work/LATEST"
s3 cp --only-show-errors "$work/LATEST" "s3://$BACKUP_S3_BUCKET/$BACKUP_PREFIX/LATEST"
echo "uploaded s3://$BACKUP_S3_BUCKET/$key"
