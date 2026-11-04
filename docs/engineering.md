# Engineering guide

How we build bookanything: where code goes, the rules that keep it healthy, and the checks that enforce them.
The design and API contract are in [`architecture.md`](architecture.md); the handbooks are [`backend/README.md`](../backend/README.md) and
[`frontend/README.md`](../frontend/README.md).

## 1. Checks

| What | Command | Enforced by |
|---|---|---|
| Kotlin formatting | `./gradlew :backend:ktlintCheck` (fix: `ktlintFormat`) | ktlint 1.8 via `.editorconfig` |
| Kotlin static analysis | `./gradlew :backend:detektMain :backend:detektTest` | detekt 2.0, `backend/config/detekt.yml` (no baseline) |
| Backend tests + coverage floor | `./gradlew :backend:test :backend:koverVerify` (report: `koverHtmlReport`) | JUnit 5, Testcontainers, Kover |
| Everything backend | `./gradlew :backend:check` (or `npm run backend:check`) | |
| Frontend formatting | `npm --prefix frontend run format:check` (fix: `format`) | Prettier, `frontend/.prettierrc.json` |
| Frontend lint | `npm --prefix frontend run lint` | ESLint 9, `frontend/eslint.config.mjs` (no suppressions) |
| Types | `npm --prefix frontend run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| Unit tests + coverage thresholds | `npm --prefix frontend run test:coverage` | Vitest (v8 coverage) |
| End to end | `npm run test:e2e` (backend running, see §9) | Playwright, desktop + mobile |
| Bundle-size budget | `npm --prefix frontend run perf:bundle` (after `build`) | `frontend/perf/bundle-baseline.json`, see below |
| Web-vitals budgets | `npm --prefix frontend run perf:vitals` (stack running) | Playwright `performance` project, `frontend/perf/web-vitals-budget.json` |
| Mobile (format, lint, design tokens, types, tests + coverage, shared-code boundary) | `npm run mobile:check` | `mobile/` (see `mobile/README.md`) |
| Repository scripts (pull request checks, release tooling) | `npm run test:scripts` | `node --test`, `scripts/**/*.test.mjs` |
| Commit messages | `npm run hooks:install` (once; checks each commit) | `scripts/conventional-commits.mjs`, §14 |
| Simulation package (format, lint, types, tests + coverage) | `npm run simulation:check` | `simulation/` |
| All of the above but e2e | `npm test` | |
| Reliability simulation | `npm run simulation:run` (own stack; options in [`simulation.md`](simulation.md)) | scripted bots, invariant checker |

CI (`.github/workflows/ci.yml`) runs seven jobs on every pull request and push to `main`: **Scripts** (`npm run test:scripts`), **Backend** (ktlint, detekt, tests, Kover
floor), **Frontend** (format, lint, typecheck, unit tests with coverage, the build as a Cloudflare Worker and its
size: `npm run cf:check`, bundle-size budget), **Mobile**
(format, lint, design-token lint, typecheck, app config per variant, tests with coverage incl. the shared-code
boundary; `docs/mobile.md`), **Simulation checks** (format, lint, typecheck, unit tests with coverage of
`simulation/`), **Simulation** (the reliability simulation for 10 minutes against a development stack, failing on any
invariant violation; [`simulation.md`](simulation.md)) and **E2E**
(Postgres 16 service, seeded backend with dev auth and the scripted fake model, production frontend build with the
`/dev` routes, the Playwright suite on desktop and mobile, then the web-vitals budgets on their own, whose report is
uploaded as the `web-vitals-report` artifact and shown in the job summary). A newer push cancels the older run. Backend tests need Docker and **fail, never skip,**
without it (Colima: see the root README).

Coverage floors are the measured value minus about two points: backend lines/branches **95/60%** (measured
96.9/61.9%), frontend lines/statements/functions/branches **90/89/87/86%** (measured 92.1/91.2/89.8/88.6%). Raise them as
coverage grows; never lower one to get a build through.

There is no recorded debt in the tools: no detekt baseline and no ESLint suppressions file. A finding is fixed by
refactoring (§3 shows the patterns); a local `@Suppress`/`eslint-disable` is only for a deliberate design choice and
says why on the same line (e.g. `normalizeSetup` cleaning model output whose types overclaim).

detekt analyses with full type resolution and must report no "compiler errors found during analysis" (run
`detektMain` with `debug = true` to list them). It runs without the kotlinx.serialization compiler plugin, so look
serializers up with the library's `serializer<Foo>()`, never the generated `Foo.serializer()`: one unresolved
companion call leaves every type that depends on it unknown. `SourceRulesTest` enforces this.

### Performance budgets

Two checks fail CI when the frontend gets slower; both compare against numbers committed in `frontend/perf/`.

**Bundle size** (`npm run perf:bundle` after `npm run build`, Frontend job). For each key route (landing, pricing,
explore, sign-in, business site, booking flow, `/my`, the main dashboard pages; `TRACKED_ROUTES` in
`scripts/check-bundle-budget.ts`) it sums the gzip size of the JS and CSS loaded on first visit, read from the build's
client reference manifests (Next 16 no longer prints "First Load JS"; the method matches Next's own
`.next/diagnostics/route-bundle-stats.json`), plus build-wide totals: JS every route shares, all client JS (lazy chunks
too) and all CSS. A metric may grow by **3% or 10 KB, whichever is larger**. Sizes are deterministic, so this is not
noise allowance: it lets small features through and catches the regressions that matter (a dependency pulled into a
shared layout, a lazy import made eager), which cost 15 KB or more at once. A metric that shrank by more than the
tolerance is reported so the baseline can be ratcheted down and the saving kept.

**Web vitals** (`npm run perf:vitals`, E2E job, against a production build and the demo seed). The `performance`
Playwright project loads the landing, pricing, explore, Lumen's site, its booking flow and the owner's dashboard
overview, each five times with a cold cache, on an emulated mid-range phone: Pixel 7 viewport, 9 Mbps / 150 ms network
and a CPU throttled until a fixed JS benchmark takes 450 ms (calibrated per test, so a fast laptop and a slow CI runner
emulate the same phone). It records LCP, FCP, CLS, TBT (long tasks after FCP until the page is quiet), TTFB, JS and
total bytes transferred and the request count, and checks each median against `perf/web-vitals-budget.json`. Budgets
are the recorded median plus 50% and at least 250 ms for timings (they vary between runs and machines), and tight for
what a build determines: the worst run plus 0.02 CLS, plus 3% or 10 KB of JS, plus 10% or 2 requests. It is Chromium
only (throttling uses the DevTools protocol), runs with WebGL off (software WebGL in a GPU-less browser measures
SwiftShader, not the page; the landing shows its CSS glass, as on low-end phones), and runs alone, after the rest of the
suite: other tests on the same CPU skew its timings. TTFB is the server's time: Chrome's network emulation delays
bodies, not response headers.

`PERF_REPORT=perf-report/name npm run perf:vitals` writes `name.json` and `name.md` (every run, medians, spread,
budgets) against any `E2E_BASE_URL`; `PERF_ASSERT=0` measures without failing (to compare builds),
`npm run perf:compare -- before.json after.json` diffs two reports, `PERF_CPU_RATE=4` pins the CPU rate for an A/B on
one machine and `PERF_RUNS=n` changes the run count.

**Re-recording.** `npm run perf:bundle -- --update` and `PERF_UPDATE=1 npm run perf:vitals` rewrite the baselines.
Re-record when a change deliberately makes a page heavier (and say why in the commit message, with the before/after
table), when it made one lighter (ratchet down), or when the emulation profile changes (re-record every page). Never
raise a budget, or the tolerance, just to get a build through: find what grew first (`npx next experimental-analyze`
for bundles, the report's per-run numbers and the LCP element for vitals). Record web-vitals budgets from a quiet
machine against a production build with the demo seed (`scripts/e2e-stack.sh up`), and if CI's runners turn out to
measure differently, record from the `web-vitals-report` artifact of a green run rather than widening the headroom.

## 2. Module layout

**Backend** (`backend/src/main/kotlin/ie/bookanything`): one package per feature, each owning its routes,
services/commands, repositories, DTOs and rules.

| Package | Holds |
|---|---|
| `booking`, `availability`, `services`, `resources`, `customers`, `team`, `business`, `reports` | the booking product |
| `payments`, `notifications`, `jobs` | Stripe, email/SMS, the job queue and periodic tasks |
| `site` (+ `site/ai`, `site/stock`), `templates`, `storage` | site builder, industry templates and AI drafts, uploads |
| `ai` (+ `ai/usage`, `ai/fake`), `assistant` (Bo) | the model seam, metering, the business assistant |
| `marketplace`, `offers`, `geo`, `mcp`, `oauth` | `/explore`, deals, geocoding, the MCP servers and OAuth |
| `auth`, `audit`, `http`, `db`, `config`, `seed` | cross-cutting: identity, audit log, HTTP helpers and errors, JDBC, config, demo data |
| `observability` | error reporting (Sentry) and metrics (Micrometer, OTLP): `Telemetry`, the request metrics plugin, the job queue gauges ([`observability.md`](observability.md)) |

`AppContext.kt` is the composition root: infrastructure and seams come in through its constructor (tests pass
fakes), and it builds one **feature module** per feature from them, once: `ctx.ai` (`AiModule`: credit meter,
metered model, usage, overage), `ctx.booking` (`BookingModule`: payments ledger, engine, lifecycle, availability,
staff, customer and public booking commands), `ctx.site` (`SiteModule`) and `ctx.assistant` (`AssistantModule`).
Modules and services take the few collaborators they use as constructor arguments, never `AppContext`; only routes,
MCP tool contexts, the job worker and the demo seeder (the app's edges) receive it. `Application.kt` installs plugins
through named installers and mounts each feature's `Route.xRoutes(ctx)`.

Inside a feature package, files are named for their role: `XDtos.kt` (wire types and inputs), `XRepository.kt`
(all of the feature's SQL), `XCommands.kt`/`XService.kt` (rules, in the caller's transaction), `XValidation.kt`
(field rules), `XRoutes.kt` (one per resource when a feature has several, mounted by the feature's
`Route.xRoutes`). One top-level behaviour class per file; DTO files may group types.

**Frontend** (`frontend/src`):

| Folder | Holds | May import |
|---|---|---|
| `app/` | routes: thin pages and layouts that compose features | anything |
| `components/<feature>/` | `dashboard`, `site`, `assistant`, `explore`, `offers`, `booking`, `onboarding`, `marketing`, `ai`, `auth`, `invitations`, `oauth`, `public` | `ui`, `lib`, shared, its own files, other features' entry points |
| `components/{brand,shells,common}/` | shared app chrome: logo, shells and navs, feedback states, theme toggle | `ui`, `lib`, shared, features' entry points |
| `components/ui/` | the design system (shadcn-style, ours) | `ui`, `lib` only |
| `lib/` | API client and hooks, auth, formatting, pure domain logic (`lib/site`, `lib/offers`, `lib/explore`, ...) | `lib` only, never components |

`lib/` is **shared with the mobile app** (`docs/mobile.md` §2): a lib module must run on React Native too (no DOM,
no browser globals, no Next.js or web-only packages, no DOM elements), unless it is listed in `WEB_ONLY_LIB` in
`frontend/eslint.config.mjs` (storage, the URL, the DOM, CSS: split pure logic out first, as `auth/dev-token.ts` was
out of `auth/dev-auth.ts`). ESLint enforces it per file; `mobile/scripts/shared-boundary.test.js` over the import
graph the app actually uses. A change to a shared module must keep `npm run mobile:check` green too.

ESLint (`eslint-plugin-boundaries`) enforces the right-hand column. Tests may import whatever they need. To use
another feature's component, import one of that feature's **entry points**: the files listed per feature in
`FEATURE_ENTRY_POINTS` in `frontend/eslint.config.mjs` (e.g. `@/components/offers/deal-price`). Add a file to that list
to make it public. There are no `index.ts` barrels: a barrel that re-exports a heavy client module puts it in every
importer's bundle (the offers barrel pulled the whole site renderer into the dashboard and the booking flow, about 20 KB
gzipped per page).

## 3. Layering and dependency direction

Backend: **thin route → service/command → repository**, with business rules as pure functions.

- Routes parse and authorise, then delegate: `booking/StaffBookingRoutes.kt` calls `StaffBookingCommands`, which
  calls `BookingLifecycle`/`BookingEngine`, which use `BookingRepository`/`AllocationRepository` (explicit SQL). No
  SQL lives outside `XRepository` objects (and `db`, the job queue and the OAuth token store).
- Rules that need no I/O are pure and unit-tested: `payments/RefundPolicy.decide`, `availability/SlotEngine.findSlots`,
  `offers/OfferModels` (`Discount.amountOff`), `site/SiteValidator`.
- Commands take a `Connection` and run inside the caller's transaction (`ctx.db.tx(businessId) { conn -> ... }`), so
  one request is one transaction. Bo's tools call the same commands as the dashboard, and a confirmed Bo action runs
  them inside the confirm transaction (`ActionService.confirm(conn, ...)`); site commands (`SiteService`) work the same
  way. Only workflows that wait on something slow own their transactions, and say so: the AI site builder
  (`SiteAiService`: read, call the model outside any transaction, commit with `commitGeneration(conn, ...)`), Bo's turn
  loop, the job worker, and payment provider calls: `BookingEngine.createInTx` commits a held booking before creating
  its checkout, and refunds are recorded in the transaction and sent after it commits (`RefundSettlement`;
  docs/architecture.md section 7).
- Dependencies point inwards: repositories never call services, nothing outside `http` knows about Ktor calls, and
  `db` knows nothing about features.

Patterns to reuse rather than re-derive:

| Need | Use |
|---|---|
| More than a handful of related arguments | a parameter object named for the concept: `SlotCheck`, `Reschedule`, `Cancellation`, `ChargeRequest`, `NewBooking`, `NewAction`, `NewSiteVersion`, `AvailabilityQuery` |
| A decision with no I/O | a pure, unit-tested object: `NewBookingRules` (payment, first status, hold, emails), `BookingQuote` (price, offer, due now), `RefundPolicy`, `TeamPolicy`, `BookingAnswers` (one rule per question kind), `FromPrice` |
| "Staff only see and book their own calendar" | `access.staffScope` (`StaffScope`: `covers`, `forNewBooking`, `forMove`, `forAvailability`, `listFilter`, `ON_RESOURCES_SQL`) |
| Removing something history may reference | `Retirement.retire` (deactivate while referenced, else delete; audited) |
| A date range from a query or tool | `DateRange(from, to).requireValid(maxDays)` (counts both ends), `startIn`/`endIn(zone)`, `call.requireQueryDateRange()` |
| A paginated list | `List.toPage(limit, cursorOf)` over a `LIMIT n + 1` query, `KeysetCursor` (`TIME_ID` for time-ordered lists) |
| A frontend link or redirect check | `ctx.config.urls` (`AppUrls`: manage, invitation, booking page, `isAllowed`, `returnOrigin`) |
| A provider call a command needs (refund, closing a checkout) | never inside the command's transaction: record the intent and queue a job in it (outbox), then `conn.afterCommit { JobRunner.runNow(db, jobId, handler) }` to run it straight away, as `RefundSettlement` does; or a plain job when nobody waits for the answer (`CheckoutExpiry`) |
| A JSON schema (Bo tool, structured output, MCP tool) | `ai/JsonSchema` only; `AiJson` for strict/lenient decoding; `completeStructured` for "call the model, fall back on refusal" |
| An environment setting | a section reader over `EnvReader` in `config/` |
| A status or kind stored as a Postgres enum | a `@Serializable` enum (`@SerialName` per value, `wire`, `parse`) with its rules on the type (`BookingStatus.isBlocking`/`MOVABLE`, `PaymentStatus`, `CancelActor`, audit `ActorType`, `Plan` with its limits); add it to `DatabaseEnumsTest` |
| Output that must not drift (tool schemas, emails) | a golden file under `src/test/resources/snapshots/` (`support/Snapshots`; `UPDATE_SNAPSHOTS=true` rewrites, then review the diff) |

Frontend: route (`app/`) → feature component → hooks in `lib/api/hooks` → typed API module in `lib/api` →
`apiFetch`. Components never call `fetch` (lint rule) or touch query keys: cache effects (optimistic updates,
invalidation) live in the mutation hooks. Pure logic lives in `lib/<domain>/` with unit tests (`lib/booking`,
`lib/onboarding`, `lib/dashboard`, `lib/services`, `lib/resources`, `lib/settings`, `lib/availability`, …), shared
option lists in `lib/catalog`, the backend's field limits and patterns in `lib/validation/limits.ts`, small React
hooks in `lib/hooks` (`useNow`, `useMounted`, `useUrlParams`, `useInfiniteScrollSentinel`, …). Big components are
split into focused subcomponents and hooks next to them. Route files are server components that render a client
feature component unless they need hooks; heavy UI opened on demand (the booking drawer and sheet, report and AI usage
charts, the site page's booking fallback) loads with `next/dynamic`. UI that is closed until asked for but should open
without a wait (⌘K, Bo's panel) loads with `next/dynamic` and mounts through `useIdleMount`, which preloads it once the
page is idle; UI that only renders after hydration (the landing demos' replicas) uses `ssr: false`. Import zod as
`import * as z from "zod"` (lint-enforced): Turbopack can't shake the named `z`, which ships every zod locale.
Public data a page shows first is fetched on the server (`lib/api/server.ts`, cached and deduplicated) and seeds the
query as `initialData`, as the site and booking pages do, rather than being fetched after hydration.

## 4. Seams and where implementations are chosen

External systems sit behind interfaces, and **`AppContext.create` is the only place that picks an implementation**
from config: `PaymentProvider` (Stripe Connect or the dev provider), `EmailSender` (Resend or log), `SmsSender`
(Twilio or no-op), `TokenVerifier` (Clerk or dev), `ModelClient` (Anthropic, the scripted fake when
`AI_FAKE_SCRIPT` is set in development, or none), `AssetStorage` (local disk or S3), `StockImageProvider`,
`Geocoder`, `WebsiteFetcher`, `ClientMetadataFetcher`. Tests pass fakes through the `AppContext` constructor (see
`support/TestSupport.kt`); a feature module can also be built on its own from its constructor arguments. Generators degrade gracefully: without a model, `TemplateDraftGenerator` and
`TemplateSiteGenerator` stand in.

Error reporting and metrics are the exception: like the logger they are process-wide (`observability/Telemetry`),
installed once by `main` (Sentry, the OTLP push) and no-ops until then, so a rule deep in a command can count an
outcome without taking another constructor argument. Count after the commit (`conn.afterCommit { ... }`), never for
work that rolls back, and only with labels from a small fixed set ([`observability.md`](observability.md) §3). Tests
record into their own registry with `withTelemetry`.

## 5. Registries

Adding a variant is one entry in a list; nothing else should switch on the type.

| Registry | Backend | Frontend |
|---|---|---|
| Site sections | `site/SectionRegistry` (`SectionSpec`: reader, defaults) | `lib/site/sections.ts` (`SECTION_DEFS`), `components/site/section-renderers.tsx`, `components/dashboard/site/forms/section-form.tsx` |
| Bo tools | `assistant/tools/ToolRegistry.DEFAULT` (`ReadTool`/`WriteTool`) | rendered generically from the tool's proposal |
| Bo nudges | `assistant/nudges/NudgeRules.ALL` | |
| MCP tools | `mcp/AnonymousMcp.TOOLS` (anonymous), `mcp/customer/CustomerTools.ALL` (signed in, with a `Scope`) | |
| Marketplace categories | `marketplace/MarketplaceCategories.ALL` | `lib/explore/category-icons.ts` |
| Industry templates | `templates/Templates` | |
| Errors | `http/Errors` (one factory per code) | `lib/api/client.ts` (`ApiError`) |

## 6. Errors

A client-visible failure is an `ApiException` from the `Errors` catalogue (`Errors.field("to", "Must be on or after
from")`, `Errors.notFound("Booking")`, `Errors.slotUnavailable()`). `StatusPages` renders it as
`{"error": {"code", "message", "fields"}}`; messages and fields are safe to show users. Unknown exceptions are logged,
reported to Sentry when it is configured, and become a generic 500. SQL constraint violations that mean something to the user are translated where they
happen (an exclusion violation on allocations is `SLOT_UNAVAILABLE`). Validation collects field problems with
`http/Validator` and throws once (`v.throwIfInvalid()`).

Catch the narrowest exception that can be thrown (`SQLException`, `IllegalArgumentException` for parsing). A
catch-all is only for a boundary (job, tool call, provider call, AI fallback) and says so:

```kotlin
} catch (e: CancellationException) {
    throw e
} catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Tool boundary: an isError result, details in the log.
```

In suspend code, always rethrow `CancellationException` before a catch-all. `!!` (Kotlin) and `!` (TypeScript) are
for invariants only (a row read back in the same transaction), never for input.

## 7. Auth, permissions, audit, tenancy

- **Auth**: every request's bearer token goes through `TokenVerifier` (Clerk JWT, or dev tokens when
  `AUTH_MODE=dev`, which is refused outside `APP_ENV=development`); `Authenticator` upserts the user.
- **Permissions**: business routes start with `call.businessAccess(ctx, Role.ADMIN)` (roles rank
  `STAFF < ADMIN < OWNER`). Staff are further limited to their linked resources (`access.staffScope`,
  `requireResource`). Bo's tools declare `minRole` and get the same checks. The frontend mirrors permissions only
  for display: components ask `usePermissions()` for a capability (`perms.manageBilling`, `perms.bookAnyCalendar`;
  `lib/business/permissions.ts`) and never compare roles; the backend decides.
- **Audit**: every mutation calls `Audit.record(conn, businessId, actor, "booking.cancelled", "booking", id, summary)`
  in the same transaction. Actors say who acted: a member (`access.actor`, `Actor.member(role, userId)`: owners as
  `owner`, others as `member`), `Actor.customer(userId)` / `GUEST`, `Actor.SYSTEM` (jobs,
  webhooks), `Actor.ai(memberUserId)` (Bo or the site builder, on a member's behalf), `Actor.oauthClient(...)` (an
  AI assistant on the customer MCP).
- **Tenant isolation**: every business-owned table has `business_id` and `UNIQUE (business_id, id)`; children use
  composite foreign keys (`FOREIGN KEY (business_id, resource_id) REFERENCES resources(business_id, id)`), so a
  cross-tenant reference cannot exist. Row-level security (`tenant_isolation` policies) applies when the
  transaction sets `app.business_id`, which `ctx.db.tx(businessId)` does. Queries still filter by `business_id`.

## 8. Migrations

Liquibase formatted SQL in `backend/src/main/resources/db/changelog/db.changelog-master.sql`. Changesets are
**append-only**: add `--changeset bookanything:00NN-what` at the end; never edit an applied one. Liquibase checksums
include the comments, so even fixing a typo in a comment breaks every existing database. New business-owned tables
follow §7 (business_id, composite keys, RLS policy). Migrations run on start in development and with
`backend migrate` in production.

## 9. AI

Every AI feature uses `ctx.aiModel` (`MeteredAiModel`), never a `ModelClient` directly: it reserves credits before
the call, settles the real cost after, and refuses with `AI_LIMIT_REACHED` when a business is out of credits. Pass an
`AiCaller` naming the feature and business. Prompts and tool inputs never include sensitive booking answers. In tests
and e2e, `ScriptedModelClient` (`AI_FAKE_SCRIPT=demo`) replaces the network.

## 10. Naming

- Kotlin: packages by feature; `XRoutes.kt` (`fun Route.xRoutes(ctx)`), `XService`/`XCommands`, `XRepository`
  (SQL), `XDto` for wire types, `XInput` for request bodies, `XRow` for database rows. One top-level class per
  file, named after it. Constants in `UPPER_SNAKE_CASE`; name a number when it is a business rule
  (`MAX_LIST_RANGE_DAYS = 366`).
- TypeScript: `kebab-case.tsx` files, `PascalCase` components, `useX` hooks, `xApi` modules in `lib/api`, query keys in
  `lib/api/query-keys.ts`. Types mirror the backend DTOs in `lib/api/types.ts`.
- JSON is camelCase both ways; database columns are snake_case.

Design-system golden rules (tokens only, no raw colours, `cn()`, our `ui/` components, mobile first) are in
[`frontend/README.md` §1](../frontend/README.md#1-golden-rules).

## 11. Testing expectations

| Layer | Where | What |
|---|---|---|
| Unit (backend) | `src/test/.../UnitTests.kt`, `*UnitTest.kt`, rule tests | pure functions: refund policy, slot engine, validators, prompts |
| Integration (backend) | `src/test/...` with `withApp(TestEnv())` | real HTTP through Ktor's test host, real Postgres 16 (Testcontainers), role and tenant checks |
| Unit/component (frontend) | `*.test.ts(x)` next to the code or in `__tests__/` | pure `lib/` logic; components with Testing Library and a mocked `fetch` (`components/dashboard/test/render.tsx`) |
| End to end | `frontend/tests/e2e/*.spec.ts` | user journeys against a seeded backend, desktop and mobile |

**Test data.** Build what a test is about, not a copy of someone else's fixture:
- `testBusiness { person(..); space(..); service("Wash", 30) { price(..); deposit(..); option(..); addon(..); needs(..);
  capacity(..); approval(); onlyFor(..) }; group(..); question(..) }` (`support/TestBusiness.kt`) builds a
  `BusinessSetup` with defaults that stay out of the way; `api.createBusiness(setup)` creates it and resolves every id
  by name into a `Clinic`. `Fixtures.clinic` is the shared physio-style fixture built the same way.
- `AccessWorld` (`support/AccessWorld.kt`) is a business with one of everything, its members (owner, admin, staff linked
  to Alex), a customer, a booking per calendar and a second business, for tests that call routes as every kind of
  caller; `env.access(user, businessId)` resolves a `BusinessAccess` for calling services and commands directly.

**The access matrix.** `security/RouteAccessMatrixTest` walks Ktor's routing tree and needs an entry for every route:
the expected status for owner, admin, staff, customer, another business's owner and anonymous (`Member(min, ok)`,
`Open`, `SignedIn`, `Holder`, `Nobody`). A new route fails `every route has a matrix entry` until someone decides who
may call it. Allowed callers get a request that passes the access check but changes little (an empty body validation
refuses, or a fresh target from `fresh = { ... }`). The same table drives two more passes: staff aimed at another
calendar's booking, customer or time off (404/403), and another business's ids inside your own routes (404). A third
test keeps `openapi.yaml` and the served routes identical.

**Contracts and drift.** Golden files for output that must not drift (`support/Snapshots`); `DatabaseEnumsTest` keeps
Kotlin enums, JSON names and Postgres enum labels equal; `MigrationsRlsTest` applies every changeset to an empty
database and requires RLS with FORCE and a `business_id` policy on every table with a `business_id` column (new tables
are covered automatically); `SourceRulesTest` holds conventions the tools can't see (`serializer<T>()`). On the
frontend, `src/lib/api/__tests__/contract.test.ts` validates typed fixtures (`fixtures/*.ts`, declared
`satisfies Booking` etc., a complete and a sparse one per schema) against `backend/openapi.yaml` with every object
closed, so a field added, dropped or made nullable on one side only fails with the schema and path. Add a fixture
when you add a type to `lib/api/types.ts`.

**Performance budgets.** `perf/QueryBudgetTest` calls the hot endpoints (public site and booking flow, marketplace
search, the dashboard pages) through a `CountingDataSource` and requires each to run exactly the number of SQL
statements in `perf/QueryBudgets`; the booking list and marketplace search must also run the same statements for more
rows, so a query per booking or listing fails. When a change adds or saves a statement on purpose, update the budget in
the same commit and say why. `db/PlanTest` checks that the key queries can use their index in production: tests connect
as a superuser, which skips row-level security, while production runs as an ordinary role under the tenant policies,
where only leakproof operators can be index conditions (citext `=`, `lower()` and `&&` are not). `support/QueryPlans`
runs repository code as such a role against a seeded database and returns each statement's plan; when you add an index
for a query, add the case that asserts its `Index Cond`. Read many businesses or services at once through the batch reads
(`AvailabilityService.computeAll`, `ServiceRepository.listByBusiness`, `OfferPricing.books`), never in a loop.

**Accessibility.** Component tests assert `await expectNoAxeViolations(container)` (`src/test/axe.ts`, vitest-axe;
pass `document.body` to include Radix portals; colour contrast is off in jsdom, so it is checked end to end). `tests/e2e/accessibility.spec.ts` runs axe (WCAG 2.1 A/AA) on every page in
`tests/e2e/main-pages.ts`, light and dark, desktop and phone; `layout-and-theme.spec.ts` checks the same pages never
scroll sideways on a phone and follow the OS into dark mode. Text tokens keep 4.5:1 on every surface they can sit on
(the theme and palette tests assert it). Assert by role and accessible name (`getByRole`), never by class.

**Determinism.** Backend tests use `MutableClock(DEFAULT_NOW)` (2026-10-05T08:00Z) and never the wall clock; external
services are fakes (`FakeStripeGateway`, `RecordingEmailSender`, `ScriptedModelClient`, `LocalHttpServer` for HTTP
clients). No test touches the network or sleeps: races use real threads released together (a latch) and assert
exactly one winner; waits poll with a timeout. Frontend tests that depend on "now" pin it (`vi.setSystemTime`) and mock
`fetch`. E2E specs that book create a throwaway business (`createBusiness(request, "car_wash")` in
`tests/e2e/journey-helpers.ts`, owned by a fresh dev user) instead of competing for slots on the demo businesses.

**Running e2e.** `scripts/e2e-stack.sh up` starts an isolated stack next to your own servers (fresh database, backend
from its own distribution on :8095, production frontend build with the `/dev` routes on :3002), `test` runs Playwright
against it, `frontend` rebuilds just the frontend, `down` stops it and drops the database. The stack's backend sets
`RATE_LIMIT_MULTIPLIER` (development only, refused otherwise) so repeated runs through one address are not rate
limited, and switches Bo on (`ASSISTANT_ENABLED`, off by default) for its specs; `test-assistant-off` restarts the
backend with Bo off, runs `assistant-off.spec.ts` (`E2E_ASSISTANT=off`) and then switches Bo back on. CI's e2e job
runs the same spec last, after restarting its backend with Bo off. Against your own servers: backend on :8080 (`npm run backend:dev`, `ASSISTANT_ENABLED=true AI_FAKE_SCRIPT=demo`
for Bo) and `npm run test:e2e`; `E2E_BASE_URL` points at an already running frontend.

New behaviour comes with a test at the lowest layer that can show it; a bug fix comes with the test that would have
caught it.

## 12. How to add...

**An endpoint**
1. Add the route to the feature's `XRoutes.kt`: authorise (`call.businessAccess(ctx, Role.X)`), parse
   (`call.receiveBody<XInput>()`), validate with `Validator`, call a service/command inside `ctx.db.tx(businessId)`.
2. Put logic in the service/command and SQL in the repository; record an audit event for mutations.
3. Document it in `backend/openapi.yaml` and `docs/architecture.md` §6; add the TypeScript type, API function,
   query key and hook in `frontend/src/lib/api`.
4. Test happy path and validation; add the route's entry to `RouteAccessMatrixTest.MATRIX` (who may call it; the
   matrix then checks every role, staff scoping and another tenant's ids), and document it in `openapi.yaml` (checked).

**A site section type**: a `SectionType` value and `SectionSpec` (reader, defaults) in `site/SectionRegistry`; the
content type in `SectionContent.kt`; then `lib/site/section-meta.ts` (`SECTION_META`: label, defaults, "has content")
and its zod schema in `lib/site/sections.ts` (`SECTION_SCHEMAS`), a renderer in
`components/site/sections/` registered in `section-renderers.tsx`, and a form in `components/dashboard/site/forms/`.
Add it to the AI site prompt and validator tests.

**A Bo tool**: implement `ReadTool` or `WriteTool` in `assistant/tools/` (input schema, `minRole`, and for writes a
`Proposal` the owner confirms) calling existing commands; add it to `ToolRegistry.DEFAULT`; extend the fake script
if e2e should exercise it; test guards (`ToolGuardsTest`) and the action flow.

**An MCP tool**: add an `McpTool` (definition, input schema, `Scope` for the customer server) to `AnonymousMcp.TOOLS` or
`CustomerTools.ALL`; reuse the marketplace/booking services; apply the rate limit through the tool context; test
schema rules (`McpToolRulesTest`) and the call end to end.

**A page**: a route in `src/app/...` that renders a feature component (`components/<feature>/...`) inside the right
shell; data through `lib/api` hooks; loading/error/empty states from `components/common/feedback` and `ui/`; nav
entries in `components/shells/dashboard-nav.ts`. Add a component test, and an e2e spec for a new journey.

## 13. Known debt

The architecture review (October 2026) paid off the recorded debt: the 59-finding detekt baseline and the 52 ESLint
suppressions are gone, `noUncheckedIndexedAccess` and `no-unnecessary-condition` are on, and Clerk's deprecated
`createRouteMatcher` is replaced by `protectRoute()` in the protected layouts. What is left, honestly:

Backend
- A few files still group classes on purpose (Bo's tools by area) or by leftover (`PlanTransforms.kt`,
  `SiteRuleEditor.kt`, `ai/usage/AiOverage.kt`, `ai/usage/Credits.kt`).
- An expired hold keeps `payment_status = pending` (a late payment may still revive it); clients hide the badge.
- A refresh token can't narrow `bookings:write` to `bookings:read` (the scope check ignores write-implies-read).
- Stripe refunds reported `failed` are recorded and not retried, while the email says the refund "is being processed";
  a `pending` refund counts as done and a later failure is not handled.

Decisions for the product owner (behaviour the tests pin as it is today):
- A late cancellation after a partial refund refunds the late percentage of what was paid, capped at what is left
  (6000 paid, 2000 refunded, 50% late: 3000 more, 5000 in all), not 50% overall.
- The Free plan's monthly booking limit also blocks bookings staff make in the dashboard (architecture §5.3 names only
  public bookings).
- A deposit booking shows the "Paid" badge once the deposit is paid (the price line says "€20 paid").
- Staff see sensitive answers on bookings for their own calendar (the privacy page says "visible to that business's
  staff").
- `RATE_LIMITS_ENABLED=false` is honoured in production (useful behind an edge limiter, but it turns every limit off).
- Unknown PNG/WebP chunks are kept in uploads (served inertly); S3 objects get the sanitised type but not `nosniff` or
  `Content-Disposition: inline` (set them on the CDN).

Frontend
- Wording differs between onboarding, the dashboard and the marketing pages for payment modes, question kinds,
  resource kinds and duration ranges, and the dashboard's currency list lacks CZK. The shared lists in `lib/catalog`
  and `lib/booking/quote` hold one wording each; unifying the visible text needs a product decision.
- Deliberate near-duplicates with different semantics: the dashboard's `amountDue` (price minus paid) vs
  `amountDueCents` (deposit or price minus paid); category grouping ("Services" first vs "Other" last); the public
  flow treats a 409 `CONFLICT` as a taken slot, the dashboard only `SLOT_UNAVAILABLE`.
- My bookings' reschedule assumes 90 days of advance booking (`CustomerBooking` carries no policies).
- `/oauth/authorize` is guarded client-side only (its consent flow handles sign-in itself).
- Keyboard gaps the October test audit left: colour swatch groups have no arrow keys; owner-role tooltips can't be
  reached by keyboard; full-page error and not-found screens have no h1 (`EmptyState` supports levels 2-4).
- Booking changes don't refresh the marketplace's "next free times" (stale until refetched).
- Code splitting made the total of static chunks larger (4.4 MB → 4.7 MB raw) while every dashboard route's first
  load got 30-200 KB gzip smaller; keep an eye on chunk counts.

## 14. Commits, pull requests and versions

Every commit is a [Conventional Commit](https://www.conventionalcommits.org): `type(scope): summary`, at most 100
characters, no full stop.

| Type | For | Version bump |
|---|---|---|
| `feat` | something a user, a business or an API client can do that they could not | minor |
| `fix` | a bug fixed | patch |
| `perf` | faster or lighter, same behaviour | patch |
| `refactor` | code reshaped, same behaviour | patch |
| `docs`, `test` | documentation; tests only | patch |
| `build` | the build, dependencies (`build(deps): …`), images | patch |
| `ci` | workflows and the release train | patch |
| `chore` | anything else that ships nothing | patch |
| `revert` | `revert: <the reverted subject>` | patch |

- **Scopes** name the area: `backend`, `web`, `mobile`, `payments`, `mcp`, `ai`, `deploy`, `observability`, `sim`,
  `deps`, `db`. Optional, lower case.
- **Breaking changes** add `!` after the type or scope (`feat(mcp)!: drop the v1 tool names`) or a `BREAKING CHANGE:`
  footer saying what breaks and what to do. Breaking means a client or an operator has to act: an API field removed or
  changed, an MCP tool renamed, an environment variable that must now be set.
- The body says why, and what a reviewer should check. One logical change per commit; mechanical changes (formatting,
  renames, generated files) go in their own commit, separate from behaviour.
- Lint, types and tests pass at every commit you push; update docs (`architecture.md`, OpenAPI, the READMEs) in the
  same change as the behaviour.
- `npm run hooks:install` turns on a local `commit-msg` hook that runs the same check (`scripts/hooks/commit-msg`).

**Pull requests** have a Conventional Commit title too, and the **Pull request** workflow
(`.github/workflows/pull-request.yml`) checks it and every commit in the pull request (merge commits excepted:
`scripts/conventional-commits.mjs`), and that nothing in it must not be published (below). Pull requests are merged
with a **merge commit**, never squashed or rebased: every commit lands on `main` as written, and the merge commit keeps
GitHub's own message ("Merge pull request #12 from …"), which the checks and the versioning skip. So the commits, not
the title, are what versions and release notes are made of; the title names the merge for a reader of the history.
`main` is protected by the ruleset in `.github/main-ruleset.json`: changes arrive through pull requests merged with a
merge commit, the checks above and CI's jobs must pass on a branch up to date with `main`, and nobody force-pushes or
deletes it, and nobody bypasses it. The file is the ruleset as applied: change it in a pull request, then
`gh api -X PUT repos/<owner>/<repo>/rulesets/<id> --input .github/main-ruleset.json` (`gh api repos/<owner>/<repo>/rulesets`
lists the id). The repository allows merge commits only, and deletes a branch once its pull request is merged.

**Versions** are [SemVer](https://semver.org), derived from these commits: the next version is the last stable
release's, bumped by the strongest change among the non-merge commits since it (`feat` minor, `!` or
`BREAKING CHANGE` major, anything else patch). Until 1.0 a breaking change bumps the minor version instead, and 1.0.0
is chosen by hand, never derived. With no release yet the first is 0.1.0. The release train that cuts them (nightly,
staging, production) is [`releases.md`](releases.md).

Dependabot (`.github/dependabot.yml`) opens weekly grouped updates as `build(deps): …` and `ci(deps): …`, so they pass
the same checks.

### What may be published

The repository is public, and so is everything sent to GitHub: files, commit messages, branch names, pull request
titles and descriptions, issues and comments. Edits keep a history anyone can read.

- No personal information: no real machine or host names, tailnet names or addresses, LAN addresses, local URLs,
  home-directory or volume paths, email addresses, phone numbers or account handles other than the repository's own.
  Use placeholders: `build-box`, `tail1234.ts.net`, `/Users/dev/…`, `dev@example.com`, `198.51.100.0/24`.
- No names of products or services that compete with bookanything: describe the idea instead. Tools, libraries,
  infrastructure vendors and data sources the project uses are fine.
- No private backlog or ticket numbers.

The **Nothing personal, no competitors** check (`scripts/publication-check.mjs`) reads a pull request's title,
description, commit messages and added lines for the patterns it can know (tailnets, Tailscale addresses, home and
volume paths, email addresses outside example and the product's own domains) and for the repository secret
`PUBLICATION_DENYLIST`: one regular expression per line, case-insensitive unless the line starts with `=`, holding the
competitors' names and the owner's machine names, which no file may spell out. A match is reported without its text.
The secret is required for pull requests from this repository: add it under both Actions and Dependabot secrets. A
fork's pull request gets no secrets, so it is checked without the list, with a warning to read it for names.
