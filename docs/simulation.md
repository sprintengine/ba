# Reliability simulation

A suite that runs the app the way its users do, for as long as you let it: customers book random times, pay or
walk away from payment, cancel and reschedule; owners approve requests, book for customers, add and retire services,
add staff, change who can do what and their hours, take time off and close for the day. Throughout, a checker asserts
the invariants below. It runs for 10 minutes in CI, and nightly for 5 hours against staging (built to run for days;
see [On staging](#on-staging)), to show the app stays correct under sustained, overlapping, realistic use, and to find
the bugs that only show up then.

The bots are scripted, not AI: every decision comes from a seeded random stream, so a seed names a run. The code is in
`simulation/` (TypeScript, Node 22). It drives the API through the website's own client (`frontend/src/lib/api`, the
module the mobile app shares too), so the client is exercised as well.

This is not a load test: it runs at a modest, steady rate and judges correctness. For capacity, see
[Load tests](#load-tests-k6) below.

## What the bots do

| Actor | Actions |
|---|---|
| Customers | Browse availability; book as guests (`POST /v1/public/businesses/{slug}/bookings` with an Idempotency-Key), some signed in; pay (the development provider's checkout), cancel at checkout or abandon payment so the hold lapses; repeat a request with the same key, and send a different one with it; race each other for one time (3 to 6 at once, up to three more than the seats left for a group session); fill a group session past its last seat; cancel, reschedule, pay later and look at a booking through the manage link; book at times that are never offered (off the grid, at night, in the past, past the advance window). |
| Owners | Approve or decline requests; book for customers (no payment, at the venue, or a payment link the customer then pays); cancel with the policy's refund, a full one or none; reschedule; mark completed or no-show once started (and try before, which must be refused); record payments taken in person; create services (one-to-one or group, free, at the venue, paid in full or by deposit, approval-only, buffers, slot intervals), change them (price, length, buffers, approval, payment, who can do them through `requirements[].resourceIds`, visibility) and retire them; add and remove people; replace weekly hours; add and remove time off, extra hours and closures; change policies; invite staff (who sign in, which accepts) and remove them. |
| Staff | List bookings (only their own may show); book onto their own calendar; try a colleague's (refused); take time off; record outcomes. |

Businesses are created through onboarding at the start, in timezones where it is working hours then (so bookings
start, end and get outcomes within a short run; the zones differ from run to run). Holds last 5 minutes (with the
development payment provider; Stripe makes them at least 31) and minimum notice is 0 to 30 minutes, so lapsed holds,
outcomes and reminders all happen during a CI run.

**The Free plan scenario.** At the start, one more business is driven to its monthly limit: concurrent customer and
staff bookings up to 97, then 7 at once for the last 3 places (exactly 3 may succeed), then a customer and a staff
booking that must both be refused with `PLAN_LIMIT_REACHED`. Before that, four invitations at once race for its two
free team seats (exactly two may succeed). Every other business is on the Free plan too, so long runs reach the limit
everywhere; the bots then keep managing existing bookings, and the limit's refusals are checked against the business's
usage (`GET /billing`). Plans can't be upgraded without Stripe, so the paid plans are not simulated.

**Long runs.** A Free business fills up for the month within minutes at the default rate. So that bookings keep
flowing for days, a business that has refused a booking for its limit is retired two hours later (bots leave it; the
SQL checks still cover it, and the final check reads it through the API too), and whenever fewer than `--businesses`
can still take bookings, a new one is opened through onboarding.

## Invariants

A violation fails the run. Each is defined in `simulation/src/invariants.ts`.

| Invariant | What is checked |
|---|---|
| `no-5xx` | No request gets a 5xx answer or no answer. The request id is recorded. |
| `expected-outcome` | Every request ends in an outcome its action allows: success, or a refusal that can legitimately happen (409 `SLOT_UNAVAILABLE` when another bot took the time, `PLAN_LIMIT_REACHED`, `POLICY_VIOLATION` once a hold lapsed...). |
| `no-overlap` | No resource has two active allocations that overlap, buffers included, unless both are seats of the same group session. The database's exclusion constraint guarantees it for one-to-one bookings; the checker verifies it anyway, and for one-to-one against group bookings, which only the application guards. |
| `group-capacity` | A group session never has more bookings than seats. Only the application enforces this, so racers hammer it. |
| `valid-slot` | A booking is only created at a time the business offered when it was booked: within open hours (weekly rules, time off, extra hours, closures; buffers included), on the service's slot grid, outside the minimum notice and within the advance window for customers, on as many resources as the service needs, each from its pool. Checked against an independent model (`simulation/src/oracle.ts`) whenever the business's setup didn't change while the request was in flight. Later changes to hours legitimately leave existing bookings outside them; those are never flagged. |
| `creation-contract` | A new booking starts at the time asked for, has the service's length and price, its first status follows from the payment and approval settings, and a hold lasts the business's hold time. (That its resources come from the service's pools is part of `valid-slot`.) |
| `hold-expiry` | No booking is still held 3 minutes after its hold lapsed (the expiry job runs every minute). |
| `jobs-healthy` | No job created during the run failed for good, is stuck running for 10 minutes, or waited more than 5 minutes past its time. SQL only. |
| `refund-policy` | Every cancellation refunded what the policy says (worked out independently in `simulation/src/refunds.ts`): business cancellations and declines in full, customers in full before the notice and the late percentage after it, staff overrides as chosen; never more than was paid. |
| `idempotency` | The same request with the same Idempotency-Key returns the same booking (200); a different request with it is refused with 409. |
| `plan-limit` | A Free business never has more than 100 bookings in a calendar month (its timezone; staff bookings count, lapsed holds don't), and a `PLAN_LIMIT_REACHED` refusal only comes at the limit. |
| `member-cap` | A Free business never has more than 3 members and pending invitations; a fourth invitation is refused. |
| `state-consistency` | The server matches the shadow model: every booking the bots made has the status, time and amount paid they left it with, or what it may have become on its own (a lapsed hold, an ended booking completed). In SQL also: bookings that hold their time have active allocations and others don't. |
| `staff-scope` | Staff only see bookings on their own calendar and only book onto it. |
| `auto-complete` | Confirmed bookings are completed within 70 minutes of ending (the job runs hourly; long runs only). |
| `reminders` | Confirmed bookings starting within 23 hours have had their reminder claimed (the job runs every 5 minutes). SQL only. |

The checker runs every minute and at the end, after the bots stop and a settling pause (90 seconds by default). It
reads through the API as each business's owner, and, given a read-only `SIM_DATABASE_URL`, the tables directly (it
sets `default_transaction_read_only`, so a full-access URL is safe too).

### Known failures

None. A real bug the simulation finds is fixed with a regression test in the backend; one that can't be fixed at once
is listed here (with its seed, request ids and cause) and in `KNOWN_FAILURES` in `simulation/src/invariants.ts`, so CI
stays green while it is reported in every run's summary. `--strict` fails on known failures too.

Bugs found so far, all fixed:

- **The Free plan's monthly limit could be exceeded** by bookings made at once: each counted the month's bookings
  before any of them committed, so all saw the last place free (a business ended its month at 104 of 100). The count
  now runs under a per-business advisory lock (`BusinessRepository.lockMonthlyBookings`; `PlanLimitRaceTest`).
- **A Free team could get a fourth member** from invitations sent at once, for the same reason
  (`BusinessRepository.lockSeats`; `PlanLimitRaceTest`).

## Running it

### Locally

```sh
npm run simulation:install                               # once
scripts/simulation.sh                                    # 10 minutes at 90 actions a minute
scripts/simulation.sh --duration 30m --rate 60 --seed nightly-1
```

`scripts/simulation.sh` starts an isolated stack (`scripts/e2e-stack.sh backend` with its own database,
`bookanything_sim`, and port, 8097: not a developer's servers, nor the end-to-end stack's defaults), runs the
simulation with SQL checks, and stops that backend and drops its database again (`e2e-stack.sh backend-down`). The
backend runs in development mode: dev sign-in, the dev payment provider, and `RATE_LIMIT_MULTIPLIER=50` so a few
hundred bookings from one address aren't rate limited. Set `SIM_KEEP_STACK=1` to keep it up for a look afterwards
(`scripts/simulation.sh down` stops it).

Against a stack you already run: `npm --prefix simulation run sim -- --base-url http://localhost:8080`.

The log and report land in `simulation/out/`: `sim.jsonl` has one line per action and per request (seed, actor,
method, path, status, error code, latency and the `X-Request-Id` the simulation sends, `sim-<seed>-<n>`, which the
backend logs too), plus each violation and check; `report.md` is the summary.

| Option | Default | |
|---|---|---|
| `--duration` | `10m` | `90s`, `30m`, `2h`, `3d` |
| `--rate` | `90` | actions started per minute |
| `--concurrency` | `8` | most actions in flight |
| `--businesses` | `3` | businesses besides the Free plan scenario's |
| `--customers` | `30` | distinct customers |
| `--seed` | random | printed at the start and in the report |
| `--check-every` | `60s` | |
| `--settle` | `90s` | pause after the last action before the final check |
| `--database-url` | `SIM_DATABASE_URL` | read-only SQL checks |
| `--auth` | `dev` | `dev` (dev tokens) or `simulation-token` (staging; `SIMULATION_AUTH_SECRET` in the environment) |
| `--no-plan-limit` | | skip the Free plan scenario |
| `--strict`, `--fail-fast` | | known failures fail too; stop at the first failure |

Most have an environment variable too (`SIM_RATE`, `SIM_DURATION`...; `npm --prefix simulation run sim -- --help` lists
them).

### In CI

The **Simulation checks** job runs the package's format, lint, typecheck and unit tests (with coverage thresholds).

The **Simulation** job runs it for 10 minutes at 90 actions a minute against the same kind of stack the E2E job builds
(Postgres 16, the development backend with dev sign-in, the dev payment provider and `RATE_LIMIT_MULTIPLIER=50`), with
SQL checks and the seed `ci-<run id>-<attempt>`. Any violation fails it. The report goes to the job summary, and the
action log, report and backend log are uploaded as the `simulation` artifact: download it and
`scripts/simulation.sh replay --from-log <path to sim.jsonl>` to run the same seed locally.

### On staging

The nightly **Simulation (staging)** workflow (`.github/workflows/simulation-staging.yml`) runs the simulation against
the staging deploy for 5 hours at 30 actions a minute, with Stripe Checkout payments, and uploads the action log and
report as the `simulation-staging` artifact. It also runs by hand (`workflow_dispatch`: duration, rate, share paid
through Checkout, seed). It never runs for pull requests, and skips itself with a notice until staging is configured.

**Sign-in.** Staging has no dev auth, and bots can't sign in through Clerk. With `--auth simulation-token` the runner
mints the backend's staging-only simulation tokens itself (`SimulationTokenAuthProvider` in `simulation/src/auth.ts`)
from `SIMULATION_AUTH_SECRET`, the same secret the staging backend is configured with. The backend accepts them only
with that secret set, which production refuses at startup, and only for identities in a reserved namespace: subjects
`sim_…` and emails on `sim.bookanything.test`, so a leaked secret can't sign in as a real user. Tokens are HMAC-signed,
live 10 minutes (the backend accepts at most 15) and are renewed after 5. The design and every check are in
docs/architecture.md §3.2a. Bots are otherwise ordinary users, so they exercise the real code paths; the namespace
tells them apart for cleanup and on dashboards (`simulation="true"` on the request metrics, `simulation=true` in log
lines).

**Rate limits.** Staging's limits are production's (`RATE_LIMIT_MULTIPLIER` is refused outside development). The
simulation's requests get buckets of their own instead: per identity when signed in, and for guest bookings, which all
come from the runner's one address, an `X-Simulation-Token` header signed with the same secret marks them as the
simulation's. Each such bucket allows `SIMULATION_RATE_LIMIT_MULTIPLIER` (default 50) times every limit: the public
booking limit of 20 per 10 minutes becomes 1,000 per 10 minutes. Limits are never switched off, and
real visitors' buckets are untouched. Raise the multiplier (up to 1000) for higher rates.

**Setup.**

1. Generate a secret: `openssl rand -base64 48`.
2. Staging backend (`backend.env` on the staging VM): `SIMULATION_AUTH_SECRET=<secret>`, optionally
   `SIMULATION_RATE_LIMIT_MULTIPLIER=50`; then `sudo -u deploy ./deploy.sh`. The startup line says `simulation=on`.
   Never set it in production: the API refuses to start.
3. GitHub (Settings → Environments → `staging`; its deployment branches must stay limited to `main`, so a run
   dispatched on another branch can't read them): secret `STAGING_SIMULATION_AUTH_SECRET=<secret>`, variables
   `STAGING_API_URL` (the staging API, e.g. `https://api-staging.bookanything.ie`) and `STAGING_APP_URL` (the staging
   website), and optionally the secret `STAGING_SIM_DATABASE_URL`, a read-only `postgres://` URL for the SQL checks.
4. Run the workflow by hand with `duration: 10m` to check it; the nightly run then follows.
5. Clean up weekly on the staging VM (docs/deployment.md, 2.4):
   `docker compose run --rm --no-deps backend purge-simulation --older-than-days 7` (`--dry-run` to count first).
   It deletes the simulation's businesses (slug `sim-…`, owned only by simulation users) and users created before the
   cutoff, and nothing else. Keep the cutoff longer than any run still going.

From any machine: `SIMULATION_AUTH_SECRET=<secret> npm --prefix simulation run sim -- --auth simulation-token
--base-url https://api-staging.bookanything.ie --app-url https://staging.bookanything.ie --payments stripe-checkout
--rate 30 --duration 2h`. Keep the secret out of shell history (read it from a file or a password manager).

**Payments on staging.** Staging has no dev payment provider, so run with `--payments stripe-checkout`: a share of paid
bookings (`--stripe-share`, 0.1 by default) is paid through real Stripe Checkout in test mode, driven by Playwright
with the 4242 4242 4242 4242 test card; the others are abandoned (their hold lapses). Confirmation arrives through
Stripe's webhook after the redirect, so the bots read the booking until it stops being held (up to 90 seconds), and
expect holds of at least 31 minutes. Prerequisites:

- Playwright's Chromium: Playwright itself is pinned in `simulation/package-lock.json`; `npm --prefix simulation ci`
  then `npx --prefix simulation playwright install chromium` (the workflow does this);
- Stripe on the staging backend in test mode: `STRIPE_SECRET_KEY` (`sk_test_…`), and both webhook endpoints with
  their secrets (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`; backend/README.md "Stripe");
- a Connect account with charges enabled on every simulated business. Online payment is refused with
  `PAYMENTS_NOT_CONFIGURED` without one, and the simulation does not yet connect one when it opens a business, so
  until it does, paid services on staging end in that refusal (reported as `expected-outcome` violations).

**Long runs.** A GitHub-hosted job stops after 6 hours, so a workflow run is at most 5h30m; the nightly run is 5 hours,
which covers holds, reminders, auto-completion and several businesses filling up and being replaced. For runs of days,
run the simulation from a small machine of your own (Node 22 and outbound HTTPS; leave about 2 GB of memory for
Chromium when paying through Checkout) under `tmux` or a systemd service, with the command above and `--duration 3d`.
The JSONL log gains a line per action and per request, so give it disk to match. Chaining the nightly runs instead gives daily
coverage, but each run starts a fresh world, so it doesn't find the bugs that need days of accumulated state
(month boundaries, long-lived holds and reminders across days); a run of days does. Either way, purge with a cutoff
longer than the run.

**What the secret allows.** Anyone with it can sign in on staging as any number of simulation identities (so
signed-in simulation traffic is in effect unlimited there) and as any account with a `sim.bookanything.test` address:
never use such an address for a real person. The purge deletes simulated businesses with everything in them, a real
tester's bookings there included. Production refuses the secret, so none of this reaches it.

Simulated businesses are named `Sim Business …` with slugs `sim-<tag>-…`; `purge-simulation` removes them once they
are older than the cutoff. Email to their customers is never sent: the backend skips addresses on special-use domains
(`.test`, `.example`, …), so a run doesn't bounce mail from the staging sending domain.

## Replaying a failure

A violation prints the seed, the invariant, the request id and the trail of recent actions and requests on the same
booking or business; the log has every request of the run with its `X-Request-Id`, so the backend's log lines for any
of them are a search away. To run the same seed again against a fresh stack:

```sh
scripts/simulation.sh replay --from-log out/sim.jsonl     # that run's seed and options (paths are in simulation/)
scripts/simulation.sh replay --seed nightly-1 --duration 10m
```

Options given on the command line or in the environment (`SIM_SEED`, `SIM_DURATION`...) win over the log's
(`--duration 2m` replays the start of a long run). A replay writes `out/replay.jsonl` and `out/replay.md`, leaving the
original log alone. It runs one action at a time (`--concurrency 1`). What it repeats exactly: the world it builds
(businesses, services, hours, staff, names), the sequence of actions and every random draw, since each action draws
from its own stream derived from the seed and its sequence number, and picks among lists in creation order or sorted
by name. What it can't: the server's answers depend on the time of day (businesses go to zones where it is working
hours, and times are relative to now); with concurrency the interleaving of requests differs, which changes what each
later action finds; and in runs long enough to fill businesses up (the default rate fills one in minutes), which ones
retire or open, and when, depends on timing. So a replay re-creates the conditions of a failure rather than its exact
steps; a race found at `--concurrency 8` usually needs the trail and request ids to pin down, and a regression test
written with the backend's race helpers (`backend/src/test/kotlin/ie/bookanything/support/Parallel.kt`), as
`PlanLimitRaceTest` was.

`npm --prefix simulation run check-world -- --from-log out/sim.jsonl` runs the invariant checks once over the
businesses a log names, without bots (against a stack left up with `SIM_KEEP_STACK=1`).

## Load tests (k6)

`load/` holds [k6](https://k6.io) scripts: a different kind of test. The simulation runs a steady, modest rate and asks
"is every answer right?"; a load test injects as much traffic as it takes and asks "how much can it take before it gets
slow or fails?". It checks only status codes, latency and error rates, against thresholds, and knows nothing about
invariants. Run it on purpose, against a stack nobody else is using: it is not part of CI (the **Load test** workflow
runs it by hand, `workflow_dispatch`, against a fresh development stack, and uploads k6's summary).

`load/booking.js` has three scenarios that ramp up side by side: **browse** (a business, its services, a week of
availability), **book** (a time from availability, booked with an Idempotency-Key; a 409 for a time another customer
took is an expected answer) and **manage** (book, then look at it through the manage link, find another time, move it
and cancel it). Profiles: `smoke` (a minute at a few users), `ramp` (default: 8 minutes up to 100, 20 and 15 users) and
`soak` (30 minutes at a steady load). Thresholds, which fail the run: fewer than 1% failed requests, 99% of checks
passing, p95 under 500 ms for browsing, 600 ms for availability, 1 s for booking and 800 ms for managing, and no
booking refused for a business's monthly limit (the test would then measure refusals; raise `BUSINESSES`).

```sh
# A development backend of its own, with the highest rate-limit multiplier (load comes from one address):
E2E_DB=bookanything_load E2E_BACKEND_PORT=8098 E2E_STACK_DIR=/tmp/bookanything-load E2E_RATE_LIMIT_MULTIPLIER=1000 \
  scripts/e2e-stack.sh backend
k6 run load/booking.js                      # BASE_URL defaults to http://localhost:8098
PROFILE=smoke k6 run load/booking.js
E2E_DB=bookanything_load E2E_BACKEND_PORT=8098 E2E_STACK_DIR=/tmp/bookanything-load scripts/e2e-stack.sh down
```

Before measuring, the script warms the backend up (a few reads of each business's availability, counted towards no
threshold): a freshly started JVM answers its first requests slowly while it compiles them, which a short run would
otherwise report as latency. Against a development backend the script creates its own businesses (`BUSINESSES`, 40 by default: a Free business takes
100 bookings a month, after which bookings are refused with 409). On staging, where dev sign-in doesn't exist, create
the businesses beforehand and pass their slugs (`SLUGS=a,b,c`, each with a service bookable without paying online), and
set `BASE_URL` to the staging API. Staging's public rate limits (20 bookings per 10 minutes per address) will throttle
a load test from one machine: raise them for the test or run k6 from several addresses (k6 cloud or distributed
runners), and agree the window with whoever else uses staging.
