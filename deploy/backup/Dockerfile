# Backup and restore tools: Postgres 16's pg_dump/pg_restore (the server's major version, so a dump restores into 16
# without surprises) and the AWS CLI for R2's S3 API. Build: docker build -t bookanything-backup deploy/backup
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli bash
COPY backup.sh restore.sh verify.sql /usr/local/bin/
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
USER postgres
WORKDIR /tmp
ENTRYPOINT []
CMD ["backup.sh"]
