# Deployment

What bookanything deploys to and how. **Nothing is live yet:** none of the accounts below exist, and every step of the
release train that needs one says so with a notice and moves on. This is the plan the code in `deploy/`,
`backend/Dockerfile`, `frontend/wrangler.jsonc` and `.github/workflows/` implements, and the checklist for going live.
How a change travels from `main` to production is [`releases.md`](releases.md).

## 1. Shape

```
                    Cloudflare (DNS, TLS, CDN, WAF and edge rate limiting)
visitors ──────▶  bookanything.ie        ─▶ Worker: the Next.js site (OpenNext)
                                              │ /api/*, /mcp, /.well-known/oauth-*: same-zone fetch
mobile app ────▶  api.bookanything.ie    ◀────┘
                    │ Cloudflare Tunnel (the VM dials out; nothing listens on the internet)
                    ▼
                  VM in the EU: cloudflared ─▶ backend container (Docker, no published port)
                                                 │ TLS
                                                 ▼
                                               managed Postgres 16, same region
                  uploads.bookanything.ie ─▶ R2 bucket (business images, public)
```

- **Website**: Next.js on Cloudflare Workers through the OpenNext adapter (frontend/README.md "Deploying"). The browser
  only calls `/api/*` on the site's own origin; the Worker forwards it to the API.
- **API**: the Ktor backend as one Docker image (`ghcr.io/<owner>/bookanything-backend`, public, amd64 and arm64) on one
  small VM per environment, reachable only through a Cloudflare Tunnel. The rate limiter needs that: every request
  reaches the API through Cloudflare's edge, which sets `CF-Connecting-IP` to the visitor's address, and
  `CLIENT_IP_HEADER=CF-Connecting-IP` makes the API key its limits on it (backend/README.md "Behind a proxy").
- **Deploys are pulled**: the VM follows its environment's image tag (`:staging` or `:production`). The release train
  moves the tag; a timer on the VM notices within a minute, migrates and swaps containers (section 3). CI holds no SSH
  key and the VM accepts no deploy connections.
- **Database**: managed Postgres 16 in the VM's region (Frankfurt). Point-in-time restore is the provider's; a nightly
  `pg_dump` to R2, restored and checked every night, is the second copy (section 4).
- **Files**: uploaded images in an R2 bucket served from its own hostname (the backend's S3 storage).

The API is stateless (sessions are Clerk tokens, jobs and rate limits live in Postgres), so a second instance is a
config change, not a redesign: the job worker and periodic tasks already coordinate through the database.

Two environments, the same shape:

| | production | staging |
|---|---|---|
| Website | `bookanything.ie` | `staging.bookanything.ie` |
| API | `api.bookanything.ie` | `api-staging.bookanything.ie` |
| `APP_ENV` | `production` | `staging` (every production rule, its own name in logs) |
| VM follows | `bookanything-backend:production` | `bookanything-backend:staging` |
| Postgres | its own project | its own project |
| Uploads bucket | `bookanything-uploads` | `bookanything-uploads-staging` |
| Clerk, Stripe | production instance, live keys | development instance, test keys |
| Gets a release | by promote, after staging | by release, from a nightly |

Hostnames sit one level under the zone (`api-staging`, not `api.staging`): Cloudflare's free certificate covers
`*.bookanything.ie` only. The website and the API must be in the **same zone**: a Worker's request to a hostname in
another zone carries a fixed Cloudflare address as `CF-Connecting-IP`, which would put every visitor in one
rate-limit bucket.

## 2. First-time setup

Do these once per environment, staging first. Nothing in the repository holds a real value: secrets live in GitHub
and in the env files on each VM. The GitHub side (every secret and variable the release train reads) is
[`releases.md`](releases.md), "One-time setup".

### 2.1 Cloudflare

1. Create the account and add the `bookanything.ie` zone; point the registrar's nameservers at Cloudflare.
2. SSL/TLS: mode **Full (strict)**, **Always Use HTTPS** on, minimum TLS 1.2.
3. **Tunnels** (Zero Trust, free plan): create one tunnel per environment (`bookanything-production`,
   `bookanything-staging`), connector type Docker. Copy the token (the value after `--token`) into the VM's `.env` as
   `CLOUDFLARE_TUNNEL_TOKEN`. Add a public hostname to each: `api.bookanything.ie` (staging:
   `api-staging.bookanything.ie`) → service `HTTP`, URL `backend:8080`.
4. **R2 for uploads**: create `bookanything-uploads` and `bookanything-uploads-staging`, connect a custom domain to
   each (`uploads.bookanything.ie`, `uploads-staging.bookanything.ie`), and create an R2 API token per bucket with
   **Object Read & Write** on that bucket only. These are the backend's `STORAGE_S3_*` settings (endpoint
   `https://<account id>.r2.cloudflarestorage.com`, region `auto`).
5. **Workers** (the website): subscribe to the Workers paid plan (the site's Worker is about 4.5 MiB gzipped; the free
   plan stops at 3 MiB; CI's `npm run cf:check` watches the 10 MiB limit). Create the R2 buckets
   `bookanything-web-cache` and `bookanything-web-cache-staging` (OpenNext's cache of prerendered pages). Create an API
   token for GitHub Actions from the "Edit Cloudflare Workers" template plus **Workers R2 Storage: Edit**, limited to
   this account and zone. The first deploy attaches the custom domains named in `frontend/wrangler.jsonc`.
6. **WAF** (optional at launch): the API limits per client itself. A Cloudflare rate-limiting rule on
   `api.bookanything.ie` is a cheap outer layer against floods.

### 2.2 VM provider

1. Create one VM per environment in an EU location near Frankfurt: Ubuntu 24.04, 2 vCPUs, **4 GB** RAM (two backend
   containers overlap for a few seconds during a deploy), arm64 or amd64, your own SSH key.
2. Firewall: allow inbound **TCP 22 only**, ideally from your own address. Nothing else: the tunnel dials out, and
   deploys are pulled.
3. Copy `deploy/server` to the VM and run `bootstrap.sh` as root:
   `scp -r deploy/server root@<vm>:bookanything-setup && ssh root@<vm> bash bookanything-setup/bootstrap.sh`.
   It installs Docker, creates the `deploy` system user and `/opt/bookanything`, installs `update.sh` with its
   systemd timer, copies the env templates in, turns on security updates and turns off SSH passwords.
4. In `/opt/bookanything`, as the `deploy` user (`sudo -u deploy nano .env`, …), fill in:
   - `.env`: `BACKEND_REPOSITORY=ghcr.io/<owner>/bookanything-backend`, `TRACK=staging` (or `production`) and
     `CLOUDFLARE_TUNNEL_TOKEN`;
   - `backend.env`: the API's whole configuration (`APP_ENV`, database, Clerk, Stripe, …; backend/README.md
     "Configuration" lists every variable). With `ANTHROPIC_API_KEY` set, `AI_CREDIT_MICRO_CENTS`, `AI_CREDITS_FREE`,
     `AI_CREDITS_PRO` and `AI_CREDITS_BUSINESS` are required too: the API refuses to start without them;
   - `migrate.env`: the database owner's credentials (2.3).

   The updater deploys whatever the environment's tag names within a minute; until the release train has moved the
   tag once, it waits.

### 2.3 Postgres provider

1. Create one project per environment in **AWS Frankfurt (eu-central-1)** with **Postgres 16**, and a database
   `bookanything`. The project's owner role runs migrations (and backups) only.
2. The double-booking guarantee is an exclusion constraint that needs the `btree_gist` extension. Neon supports it
   (version 1.7 on Postgres 16); the first migration creates it, with `citext` and `pgcrypto`.
3. Create the application role. Roles the provider's console creates can bypass row-level security, which would
   switch tenant isolation off, so the API runs as a role made in SQL. From the VM (it has `psql` 16), with
   `deploy/sql/app-role.sql` copied over: `psql "<owner connection string>" -f app-role.sql`, then
   `psql "<owner connection string>" -c '\password bookanything_app'` (psql hashes the password; nothing logs it).
   Run `app-role.sql` once more after the first deploy: it takes the migration history's tables away from the role.
4. Use the **direct** connection string, not the pooled one: the API keeps session settings and session advisory
   locks, which a transaction-mode pooler breaks. In `backend.env`:
   `DATABASE_URL=jdbc:postgresql://<host>/bookanything?sslmode=require` with `DATABASE_USERNAME=bookanything_app`; in
   `migrate.env`: the owner role and its password.
5. Set the point-in-time restore window to the longest the plan allows. The job worker polls the database, so the
   compute never scales to zero: pick the smallest fixed size.

## 3. On the VM

`update.sh` runs every minute (`bookanything-update.timer`). It pulls `BACKEND_REPOSITORY:TRACK`, and when the tag names
a different image than the one running it:

1. installs that image's own deploy files (`compose.yml`, `deploy.sh`, `update.sh` ship inside it under
   `/app/deploy`), so a release that changes them takes effect with that release;
2. runs `deploy.sh` on the image's digest, which applies the migrations as a one-off container
   (`docker compose run --rm migrate`, the owner's credentials from `migrate.env`); if they fail, the running release
   is left alone;
3. starts a second backend container from the new image beside the old one: both answer to `backend` on the Docker
   network, so cloudflared spreads new connections over both;
4. waits for the new one's health check (`GET /v1/health`, which also checks the database), then stops the old one
   with SIGTERM: it finishes requests in flight for up to 15 seconds and exits.

If anything fails before the old container is stopped, `.env` and the deploy files are put back, the new container is
removed and the image is remembered in `.failed-image`, so it is not retried every minute: the next deploy is the tag
moving again.

Expected blip: none for ordinary requests. A request on the old container's keep-alive connection at the moment it
closes can get a 502 from Cloudflare, and a reply streamed by Bo that is still running after 15 seconds is cut off; the
client retries both. From the moment the new container listens it takes a share of new connections, so a release that
starts but answers errors serves some of them until its health check fails it (at most three minutes).

**Migrations must work with the release before them**, because for a few seconds both run against the new schema, and
because a rollback does not undo them: add a column or table, backfill, switch the code, and drop the old one in a later
release. Changesets are append-only anyway (docs/engineering.md §8).

Everything in `/opt/bookanything` belongs to the `deploy` user, and the scripts refuse to run as anyone else (a file
written as root would lock the updater out): run them as `sudo -u deploy …`, and edit the env files with
`sudo -u deploy nano …` (or `sudoedit`, then `chown deploy:deploy`).

**Settings**: edit `backend.env`, then `sudo -u deploy ./deploy.sh` swaps in a container of the running image with the
new settings, without a gap (`sudo -u deploy docker compose up -d backend` also works, with a few seconds' gap).

**Looking at it** (in `/opt/bookanything`): `sudo -u deploy ./update.sh --status` (what the tag names, what runs, the
last failure),
`journalctl -u bookanything-update` (each deploy), `.deploy-history`, `docker compose ps`,
`docker compose logs -f backend` (one logfmt line per request with its request id), `docker compose logs cloudflared`.
`LOG_LEVEL=DEBUG` in `backend.env` logs each rate-limited request's client address and headers: after the first staging
deploy, make a booking through the site and check the `client ip=… client-ip-header=…` line shows your address, not a
Cloudflare one.

**Errors, metrics and logs off the VM** ([`observability.md`](observability.md)): `SENTRY_DSN` and the
`OTEL_EXPORTER_OTLP_*` settings in `backend.env` send errors to Sentry and metrics to Grafana Cloud; the optional
`alloy` service (`docker compose --profile logs up -d alloy`) ships the logs to Grafana Cloud Loki.

### Running the image locally

```sh
docker build -f backend/Dockerfile -t bookanything-backend .   # 2 GB Docker VM: add --build-arg GRADLE_JVMARGS="-Xmx1g"
docker compose up -d postgres
db="-e DATABASE_URL=jdbc:postgresql://host.docker.internal:5432/bookanything_dev -e DATABASE_USERNAME=bookanything -e DATABASE_PASSWORD=bookanything"
docker run --rm $db -e APP_ENV=development bookanything-backend migrate
docker run --rm -p 8080:8080 $db -e APP_ENV=development bookanything-backend
curl localhost:8080/v1/health
```

(On Linux without Docker Desktop, add `--add-host=host.docker.internal:host-gateway`.) `scripts/release/backend-smoke.sh
<image>` runs an image the way a VM does, against a throwaway Postgres, as the release train's acceptance does.

## 4. Backups and restore

Two layers:

1. **The provider's point-in-time restore** is the first thing to reach for: it restores to any second in its window
   (2.3) into a new branch or database in minutes, without losing the day's bookings since the last dump.
2. **A nightly dump outside the provider.** `.github/workflows/db-backup.yml` runs at 02:17 UTC for each environment
   whose database secret is set. It dumps the database with `pg_dump` (custom format, Postgres 16 tools in the
   `deploy/backup` image; move them with the provider's major version) and uploads
   `<environment>/YYYY/MM/DD/bookanything-<environment>-<time>.dump` to the backups bucket, pointing
   `<environment>/LATEST` at it. Then it **restores that dump into an empty Postgres 16 on the runner and checks it**
   (`deploy/backup/verify.sql`: migrations recorded, `btree_gist` and the double-booking exclusion constraint present,
   row-level security forced, row counts printed). A failed dump, upload or restore fails the run, and GitHub notifies
   the person who last changed the workflow's schedule. The bucket's lifecycle rule keeps 35 days. Run it by hand from
   Actions › "Database backup" › Run workflow.

The dump runs as the owner role: the tables force row-level security, and `pg_dump` can only read them as a role that
bypasses it (a managed provider's owner role does; `backup.sh` checks first and says so if not).

The dumps hold personal data: the bucket stays private, its token is used only here, and an erased customer can
remain in a dump until it expires (35 days).

**Setup**: in Cloudflare, one private R2 bucket `bookanything-backups` (both environments, a folder each), a lifecycle
rule deleting objects after 35 days, and an R2 API token with **Object Read & Write** on this bucket only. In GitHub,
repository secrets `STAGING_BACKUP_DATABASE_URL` and `PRODUCTION_BACKUP_DATABASE_URL`
(`postgres://<owner>:<password>@<direct host>/bookanything?sslmode=require`), `BACKUP_S3_ACCESS_KEY_ID` and
`BACKUP_S3_SECRET_ACCESS_KEY` (the token), and repository variables `BACKUP_S3_ENDPOINT`
(`https://<account id>.r2.cloudflarestorage.com`) and `BACKUP_S3_BUCKET` (`bookanything-backups`). No GitHub
environment: a reviewer on `production` must not hold up a backup.

### Restoring a dump

Into a **new, empty** database (never over the live one), from any machine with Docker:

```sh
docker build -t bookanything-backup deploy/backup
docker run --rm \
  -e TARGET_DATABASE_URL='postgres://<owner>:<password>@<host>/<empty database>?sslmode=require' \
  -e BACKUP_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com -e BACKUP_S3_BUCKET=bookanything-backups \
  -e AWS_ACCESS_KEY_ID=<token id> -e AWS_SECRET_ACCESS_KEY=<token secret> -e BACKUP_PREFIX=production \
  bookanything-backup restore.sh latest        # or a key: production/2026/11/03/bookanything-production-....dump
```

`restore.sh` refuses a database that already has tables, restores in one transaction (all or nothing), then runs
`verify.sql`. Ownership and grants are not restored, so afterwards:

1. run `deploy/sql/app-role.sql` against the restored database as its owner, and set the application role's password
   again (`\password bookanything_app`) if the role is new there;
2. point `DATABASE_URL` in the VM's `backend.env` (and the backup secret in GitHub) at it;
3. swap in a backend on the restored database: `sudo -u deploy ./deploy.sh` on the VM.

### Testing a restore by hand

The nightly run already restores every dump. To rehearse the whole path once a quarter (and after changing provider
or Postgres version): create an empty database at the provider, run the restore above into it, run `app-role.sql`,
run the image against it locally (section 3, "Running the image locally", with the restored database's URL and
credentials) and check `/v1/health` and a business's public page (`/v1/public/businesses/<slug>`), then delete the
database.
