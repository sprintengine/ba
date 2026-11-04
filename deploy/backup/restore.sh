#!/usr/bin/env bash
# Restores a dump made by backup.sh into an EMPTY database, then checks it (verify.sql).
#
#   restore.sh <key | latest>
#
# Environment: TARGET_DATABASE_URL (libpq URL of the empty database, as a role that may create extensions), plus
# BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and, for `latest`, BACKUP_PREFIX.
# Ownership and grants are not restored: the restoring role owns everything. After restoring a real environment, run
# deploy/sql/app-role.sql again so the application role can use the tables.
set -euo pipefail

: "${TARGET_DATABASE_URL:?}" "${BACKUP_S3_BUCKET:?}"
which="${1:?usage: restore.sh <key | latest>}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
s3() { aws ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} s3 "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ "$which" == latest ]]; then
  : "${BACKUP_PREFIX:?BACKUP_PREFIX is needed to find the latest dump}"
  s3 cp --only-show-errors "s3://$BACKUP_S3_BUCKET/$BACKUP_PREFIX/LATEST" "$work/LATEST"
  which="$(tr -d '[:space:]' < "$work/LATEST")"
fi
echo "restoring s3://$BACKUP_S3_BUCKET/$which"
s3 cp --only-show-errors "s3://$BACKUP_S3_BUCKET/$which" "$work/backup.dump"

existing="$(psql "$TARGET_DATABASE_URL" -XAtq -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [[ "$existing" != 0 ]]; then
  echo "the target database already has $existing tables in public; restore into an empty database" >&2
  exit 1
fi

pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname="$TARGET_DATABASE_URL" "$work/backup.dump"
psql "$TARGET_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$(dirname "$0")/verify.sql"
echo "restored and verified $which"
