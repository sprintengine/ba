# Observability

How we find out that something is wrong in production, and what it costs to know. Error reports go to **Sentry**.
Metrics, logs and an uptime check go to **Grafana Cloud**. Both run on their free plans, so the rules below keep the
volume low on purpose.

Everything is **off by default**. Without its variables each part does nothing, so development, the tests and CI need
no account.

| What | Where | Off without |
|---|---|---|
| Backend errors (500s, provider failures, jobs out of attempts, crashed worker loops) | Sentry | `SENTRY_DSN` |
| Backend metrics (HTTP, JVM, pool, job queue, bookings and payments) | Grafana Cloud (OTLP push, Prometheus storage) | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Backend logs | stdout; Grafana Alloy on the VM ships them to Grafana Cloud Loki | the Alloy agent |
| Uptime of `GET /v1/health` | Grafana Cloud Synthetic Monitoring | the check |
| Dashboard and alert rules | `ops/grafana/` | importing them |

## 1. Backend settings

| Variable | Default | Notes |
|---|---|---|
| `SENTRY_DSN` | — | The backend project's DSN. Unset: nothing is reported. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Share of requests sent to Sentry as performance traces (`0`–`1`), each named after its route template. Keep it at 0 on the free plan, or set a low rate while investigating. |
| `APP_VERSION` | `dev` | The build running, which the release train's image sets ([`releases.md`](releases.md)): Sentry's release and the metrics' `service.version`. `dev` (a local build) is no release. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP/HTTP base URL; metrics go to `<endpoint>/v1/metrics` once a minute. Grafana Cloud: `https://otlp-gateway-<region>.grafana.net/otlp`. Unset: no metrics are recorded or pushed. |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Headers for the push, as `key=value` pairs with comma separators and percent-encoded values. Grafana Cloud: `Authorization=Basic%20<base64 of instance-id:token>`. |
| `OTEL_SERVICE_INSTANCE_ID` | `HOSTNAME` | Tells instances apart, so two running at once (during a deploy) never overwrite each other's counters. |
| `LOG_FORMAT` | `logfmt` | `json`: one JSON object per line, for the log shipper. Anything else refuses to start. |

The environment (Sentry's environment and the `env` label on every series) is `APP_ENV`: `development`, `staging`
or `production`.

## 2. Errors (Sentry)

What the backend reports (`observability/` package; `Telemetry.errors`):

- **Unhandled exceptions** in a request (the 500 `INTERNAL_SERVER_ERROR`) and database connection failures (503).
- **5xx answers without an exception:** a payment provider, image store or stock photo failure (502). A feature that
  isn't set up on the server (`*_NOT_CONFIGURED`, 503) is a state, not an error, and is not reported.
- **Jobs that fail their last attempt** (an email, a Stripe event or a refund nothing will retry), tagged with the job
  kind, id and attempts. Earlier failed attempts are only logged and counted (`jobs_runs_total{result="retry"}`).
- **A crashed worker loop or periodic task**, and uncaught exceptions on any thread (the SDK's default handler).

Each report is tagged with `requestId` (the response's `X-Request-Id`, also in every log line), `businessId`, the
route **template** and the method. Nothing else about the person is attached.

**No personal data.** The SDK collects no user details, IP addresses, request bodies or query data, and no machine
name. `SentryScrubber` checks every report again before it leaves: no user, request or breadcrumbs, and it cuts out
of messages and exception texts the emails, phone numbers, `Detail:` lines of Postgres errors (they quote the row,
which may hold a name), the document a JSON parser failed on, manage and invitation tokens in paths, and query values
of credential-like parameters (`token`, `access_token`, `api_key`, `client_secret`, `code`). The database driver is
also told not to put Postgres's row details in its messages at all (`logServerErrorDetail=false`), which keeps them
out of the logs too. Booking form answers never reach an exception message.

**Quota.** The free plan allows a few thousand errors a month. A failure that repeats (the database down, a provider
out) would use that up in an afternoon, so each kind of failure (exception class and where it was thrown, or the
message, and the first frame in our code) is sent at most 10 times an hour (`ThrottledErrorReporter`). The first
reports always go through, and the logs still record every occurrence.

The website and the app report to their own Sentry projects; see their handbooks.

## 3. Metrics (Grafana Cloud)

The backend records with Micrometer and pushes over OTLP/HTTP every minute, cumulative, durations in seconds. Grafana
Cloud stores them as Prometheus series under these names (OTLP names with dots become underscores; counters get
`_total`, timers `_seconds_bucket`/`_count`/`_sum`). Every series also has `env`, `job="bookanything-api"` and
`instance`.

| Series | Labels | What |
|---|---|---|
| `http_server_requests_total` | `route`, `method`, `status`, `simulation` | API requests. `route` is the template (`/v1/public/manage/{token}`), or `unmatched` when no route matched; `method` is GET…OPTIONS or `OTHER`; `status` is `2xx`/`3xx`/`4xx`/`5xx`; `simulation` is `true` for the reliability simulation's requests (staging only, docs/simulation.md) and `false` otherwise: the dashboard's **Traffic** variable leaves the bots out by default (`simulation!="true"` in your own queries). |
| `http_server_duration_seconds` | `area`, `simulation` | Latency histogram (buckets 50 ms, 100 ms, 250 ms, 500 ms, 1 s, 2.5 s, 10 s). `area`: `public`, `dashboard`, `account`, `ai`, `mcp`, `oauth`, `webhooks`, `health`, `unmatched`. |
| `bookings_created_total` | `outcome` | Bookings made, by the status they started in: `confirmed`, `held` (waiting for online payment), `pending_approval`. Counted once the booking commits. |
| `booking_holds_total` | `outcome` | How holds for online payment ended: `paid`, `expired`, `abandoned` (the checkout was left or failed). A payment that arrives after the hold ended is counted again: `paid_after_expiry` (the time was still free, the booking is revived) or `paid_too_late` (refunded in full). |
| `payments_refunds_failed_total` | — | Refund attempts that failed: the provider unreachable (retried), declining or refusing, or a refund it accepted failing later (docs/architecture.md §7, "Refunds"). |
| `payments_refunds_given_up_total` | `certain` | Refunds handed to the business for good (booking refunds and refunds of unmatched payments). `true`: certainly not made (declined or refused for good, nothing to refund from, or failing later at Stripe, dashboard refunds included): refund another way. `false`: unclear (Stripe unreachable to the end, past its 23 hours of idempotency, or saying the charge was refunded already): check the Stripe dashboard first. |
| `stripe_webhook_lag_seconds` | — | Histogram (1 s, 5 s, 30 s, 2 min, 10 min) of the time from receiving a Stripe event to applying it. |
| `jobs_runs_total` | `kind`, `result` | Job attempts: `done`, `retry` (failed, will run again) or `failed` (out of attempts). |
| `jobs_queue_depth` | `kind` | Due jobs waiting to run, sampled every 30 s. |
| `jobs_queue_oldest_age_seconds` | `kind` | How long the oldest due job has waited. Growing: the worker is stuck or failing. |
| `jvm_*`, `process_*`, `system_*` | `area`, `id`, `gc`, `cause`, `state` | Memory pools, GC pauses, threads, classes, CPU, file descriptors, uptime. |
| `hikaricp_*` | `pool` | Connections active, idle, pending and max; acquire, usage and creation times; timeouts. |

### Cardinality rules

The metrics plan bills by **active series**, and every distinct combination of label values is a series of its own.
So:

- **Labels come from a small set fixed in code:** a route template (never a raw path), a method, a status class, a
  job kind, an outcome, an area. Never a business, user, booking, customer or request id, a slug, a token, an email or
  free text. Ids belong in logs and Sentry tags, which are searched, not stored as series.
- **Histograms are expensive:** each label set costs one series per bucket plus three. Latency is a histogram by
  `area` only (9 values × 10 series); requests per route are a plain counter (one series each).
- **Guards:** the route label is the matched template (`RouteLabels.routeTemplate`), so a thousand different ids on
  one route are one series, unknown paths are `unmatched` and unknown methods `OTHER`. As a backstop, past 400 routes
  or 40 job kinds a new value is dropped, not stored.
- **Rare events start at 0:** the booking, hold, refund and job counters are registered at zero when the server starts,
  so the first failed refund is an increase that `increase()` and the alerts can see (a series that appears at 1 has
  nothing to increase from).
- `TelemetryTest` checks it: requests with many ids produce one series per route template, and one instance through a
  representative workload stays within its budget.

The `simulation` label has two values and is always `false` in production, so it adds no series there; on staging,
while the simulation runs, it at most doubles the request series (about 200 more).

**Budget: a few hundred series per instance.** The test's workload measured **191** (HTTP 102, JVM 53, pool 16, the
rest jobs and bookings). In production more routes get traffic: expect about 120 route/method/status combinations,
90 for the latency histogram, about 60 JVM, 16 pool, 45 for jobs (9 kinds) and 17 for bookings, payments and webhooks:
**roughly 350 per instance, so about 700 for staging and production together**, well inside the free tier's 10,000
active series. Each deploy starts a new `instance` (the container's host name), so for a few minutes the old and new
sets overlap; that churn is small at this size. Before adding a label, multiply: values × existing series. Check what is really stored with the
dashboard's "Series pushed" panel, or `count({job="bookanything-api"})` in Explore.

## 4. Logs

The backend writes one line per event to stdout, with `requestId` and `businessId` from the request (MDC), and
`simulation=true` on the reliability simulation's requests (staging; `false` otherwise in logfmt, absent in JSON):
logfmt by default, JSON with `LOG_FORMAT=json` (`backend/src/main/resources/logback.xml`). Manage and invitation tokens
are redacted from request lines. `GET /v1/health` is never logged (the uptime check calls it every minute or two), and
nor is anything outside `/v1`.

**Shipping to Grafana Cloud Loki.** On the VM, run [Grafana Alloy](https://grafana.com/docs/alloy/latest/) next to
the API with `ops/alloy/config.alloy` (a template: the endpoint and credentials come from its environment). It reads
the logs of the compose service `backend` from the Docker socket, labels them only with `service`, `env` and `level`
(each label value is a new stream, so ids are kept as structured metadata, not labels), uses the API's own timestamp
and drops DEBUG and TRACE lines. What reaches Loki is what the API logs: ids, statuses and error messages, with
tokens redacted from request paths and Postgres row details left out by the driver; customers' names, emails and
form answers are not logged.

`deploy/server/compose.yml` has it as the optional `alloy` service (profile `logs`, so a VM without it is unchanged).
To switch it on, in the VM's deploy directory:

1. Set `LOG_FORMAT=json` in `backend.env` (the next deploy picks it up).
2. Copy `ops/alloy/config.alloy` there as `config.alloy`, and write `alloy.env` (chmod 600) with `GRAFANA_LOKI_URL`,
   `GRAFANA_LOKI_USER`, `GRAFANA_CLOUD_TOKEN` and `APP_ENV` (section 6).
3. Start it once: `docker compose --profile logs up -d alloy`. It restarts with the VM; deploys leave it running.

Search them in Grafana Explore with `{service="bookanything-api", env="production"} | json`, and follow one request
with `| requestId="<X-Request-Id>"`. On staging, `| simulation!="true"` leaves the reliability simulation's requests
out (and `| simulation="true"` shows only them).

## 5. Dashboard, alerts and the uptime check

- **Dashboard:** `ops/grafana/bookanything-api.dashboard.json`. Import it in Grafana (Dashboards > New > Import) and
  pick the stack's Prometheus data source; choose the environment at the top. Health check, request rate, 5xx share,
  p95 latency, the oldest due job and failed refunds, then HTTP by status and area, the busiest routes and the routes
  answering 5xx, bookings and holds by outcome, Stripe webhook lag, the job queue, JVM and pool, and the series count.
- **Alert rules:** `ops/grafana/alerts.yaml` (Prometheus rule format, for production): health check failing, no
  metrics for 15 minutes, 5xx share over 2%, p95 latency over 1 s, a due job waiting over 10 minutes, Stripe webhook
  lag, failed refunds, a refund handed to the business (`payments_refunds_given_up_total`), and jobs out of attempts. Load them with
  `mimirtool rules load ops/grafana/alerts.yaml` (address and credentials of the stack), or import them under
  Alerting > Alert rules. Send them to a contact point (email to start with).
- **Uptime check:** in Grafana Cloud, Testing & synthetics > Synthetics > Add check > HTTP. Job name
  `bookanything-api-health` (the dashboard and the `ApiHealthCheckDown` rule look for it), target the public URL of
  `GET /v1/health` through the tunnel, expect status 200 and a body matching `"status":"ok"`, every 2 minutes from two
  European probes. That stays inside the free plan's monthly test executions (runs = frequency × probes; check the
  allowance before adding checks or probes). `/v1/health` answers 503 when the database doesn't respond within 3 s,
  so the check covers the database too. The release train's production monitor ([`releases.md`](releases.md)) also
  checks health, the release and the website every two hours from GitHub and opens an issue on a problem; this check
  is the one that pages within minutes.

## 6. Setting up the accounts

**Sentry** (free Developer plan, one user):

1. Create an organisation, with data stored in the EU.
2. Create one project per surface: the backend (Java), the website (Next.js) and the app (React Native). Each has its
   own DSN and quota counter.
3. In each project's Security & Privacy settings, turn on "Prevent storing of IP addresses" and keep the server-side
   data scrubbers on (a second line behind ours).
4. Backend: set `SENTRY_DSN` in each environment's `backend.env` (`deploy/server/backend.env.example`). The release
   comes from the image (`APP_VERSION`).
5. For source maps (website and app), create an organisation auth token and set it as a CI or EAS secret, as their
   handbooks say.
6. Set an alert for new issues (Alerts > Create alert > Issues) so the first occurrence of each error is emailed.

**Grafana Cloud** (free tier):

1. Create a stack in an EU region.
2. Metrics: in the stack's OpenTelemetry (OTLP) connection, generate a token with the `metrics:write` scope. It shows
   the endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`) and the `Authorization=Basic%20…` header
   (`OTEL_EXPORTER_OTLP_HEADERS`); set both as secrets of the API.
3. Logs: from the Loki details page take the push URL and user id, create a token with `logs:write`, and give them to
   Alloy (`ops/alloy/config.alloy`).
4. Import the dashboard and the alert rules, add a contact point, and create the uptime check (section 5).

Keep the tokens in the deploy's secret store, never in git.
