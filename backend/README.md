# bookanything backend

Kotlin + Ktor 3 (Netty) API for bookanything.ie. Raw JDBC (HikariCP) with explicit SQL,
Liquibase formatted-SQL migrations, kotlinx.serialization. Package `ie.bookanything`.

- Contract and design: [`../docs/architecture.md`](../docs/architecture.md)
- OpenAPI 3.1 spec: [`openapi.yaml`](openapi.yaml)

## Quick start (local development)

Requirements: JDK 21 and PostgreSQL 16 (Homebrew, or `docker compose up -d` from the repo root).
The Gradle wrapper downloads Gradle itself.

```bash
createdb bookanything_dev                      # or use docker compose (see below)
./gradlew :backend:installDist                  # from the repo root

# Seed four demo businesses, users and a month of bookings (idempotent, development only)
APP_ENV=development backend/build/install/backend/bin/backend seed-demo

# Run the API on :8080 with dev auth; migrations run on start in development
APP_ENV=development AUTH_MODE=dev backend/build/install/backend/bin/backend
curl localhost:8080/v1/health
```

`APP_ENV=development AUTH_MODE=dev ./gradlew :backend:run` also works (it runs `serve`). With the root `docker-compose.yml`
Postgres, set `DATABASE_USERNAME=bookanything DATABASE_PASSWORD=bookanything`.

Demo data (`seed-demo`): Lumen Physiotherapy (`lumen-physio`), Gleam Car Wash
(`gleam-car-wash`), Cadence Music Studio (`cadence-music`, Free plan) and Meadowbrook Family
Practice (`meadowbrook-practice`). Dev users: `owner@bookanything.test` (`dev_owner`, owns all
four), `staff@bookanything.test` (`dev_staff`, staff linked to "Casey Lane" at the physio and
"Dr Casey Lane" at the GP practice) and `customer@bookanything.test` (`dev_customer`, has
bookings that are linked on first `/v1/me`). All names are fictional. Each demo also gets a published site
(calm, bold, playful and clinical themes) with sample testimonials labelled "Demo customer"; rerunning
`seed-demo` adds the sites to an existing dev database without touching businesses that already have one.

Marketplace demo data (also idempotent): every demo business is placed with the built-in table geocoder (deterministic, no
network), the paid ones are listed on `/explore` (`cadence-music` is on the Free plan and stays **unlisted**, which shows the
upgrade prompt), Gleam has an "Off-peak Tuesday afternoons" deal (20% off, Tue 13:00-17:00) and Lumen a "Last-minute physio"
deal (EUR 15 off slots starting within 24 hours). Seven extra, obviously fictional businesses in Galway, Limerick, Cork,
Kilkenny, Sligo and Waterford (e.g. Snip Snip Hooray Salon, Kettlebell Kingdom, Suds and Sprockets) are listed too; they are owned
by `market@bookanything.test` (`dev_marketplace`).

## Commands

| Command | What it does |
|---|---|
| `backend serve` (default) | Runs the API. Runs migrations first when `RUN_MIGRATIONS_ON_START=true`. |
| `backend migrate` | Applies Liquibase migrations and exits (production deploy step). |
| `backend seed-demo` | Development only: migrates, then seeds demo data. Safe to rerun. |
| `backend email-preview [dir]` | Writes every email template (HTML + text, sample data) to `dir` (default `build/email-previews`). |
| `./gradlew :backend:test` | Unit + integration tests (needs Docker for Testcontainers; tests fail, never skip, without it). |
| `./gradlew :backend:check` | Tests plus ktlint, detekt and the Kover coverage floor (what CI runs). `ktlintFormat` fixes formatting; `koverHtmlReport` writes `build/reports/kover/html`. See [`docs/engineering.md`](../docs/engineering.md). |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `production` | `development` or `production`. Unset means production (fail closed): set `APP_ENV=development` for local runs. |
| `APP_HOST` / `PORT` | `0.0.0.0` / `8080` | |
| `APP_BASE_URL` | `http://localhost:3000` | Frontend origin; used in emails, manage links and dev checkout URLs. |
| `DATABASE_URL` | dev: `jdbc:postgresql://localhost:5432/bookanything_dev` | JDBC or `postgres://user:pass@host/db`. Required in production. |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | driver default (OS user) | |
| `DATABASE_POOL_SIZE` | `10` | |
| `DATABASE_STATEMENT_TIMEOUT_SECONDS` | `60` | Postgres `statement_timeout` on every pooled connection (migrations are exempt); `0` turns it off. |
| `DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS` | `120` | Postgres ends a session idle that long inside a transaction, releasing its locks (keep it above the Stripe client's 2 × (5 + 20) s); `0` turns it off. |
| `RUN_MIGRATIONS_ON_START` | `true` in development, `false` in production | |
| `AUTH_MODE` | dev when no `CLERK_ISSUER` in development, else `clerk` | `dev` is **refused unless `APP_ENV=development`**. |
| `CLERK_ISSUER` | — | e.g. `https://your-app.clerk.accounts.dev`. Required for `clerk`. |
| `CLERK_JWKS_URL` | `${CLERK_ISSUER}/.well-known/jwks.json` | Override only for testing. |
| `CLERK_AUTHORIZED_PARTIES` | — | Comma-separated allowed `azp` origins, e.g. `https://bookanything.ie`. **Required in production.** |
| `CLERK_ACCEPT_NATIVE_SESSIONS` | `false` | Also accept session tokens with **no** `azp` claim: the mobile app's (Clerk's native SDK sends no Origin, so its tokens carry none). A token with an `azp` must still name a `CLERK_AUTHORIZED_PARTIES` origin, so the web is checked as strictly as before. Turn on when the mobile app ships and the Clerk instance's Native API is enabled (see "Clerk"). |
| `CLERK_WEBHOOK_SECRET` | — | `whsec_…` signing secret of the Clerk webhook endpoint (see below). Without it `/v1/webhooks/clerk` answers 503. |
| `TOKEN_SECRET` | dev constant | **Required in production** (≥16 chars). HMAC key for booking manage links and invitation tokens. Rotating it invalidates outstanding links. |
| `STRIPE_SECRET_KEY` | — | Platform secret key (`sk_test_…` / `sk_live_…`). Enables Stripe Connect payments and billing. Without it, development uses the dev payment provider and production has payments disabled. |
| `STRIPE_WEBHOOK_SECRET` | — | Signing secret of the platform ("Your account") webhook endpoint. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | — | Signing secret of the Connect ("Connected accounts") endpoint, if it is a separate endpoint. Both may point at the same URL; each event is checked against both secrets. |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` | — | Recurring price ids (`price_…`) for the Pro and Business plans. |
| `RESEND_API_KEY` | — | Sends email through Resend. Without it emails are logged and recorded in `email_log`. |
| `EMAIL_FROM` | `bookanything <bookings@bookanything.ie>` | The address must be on a domain verified in Resend. Emails show the business name as the sender name with this address, and set Reply-To to the business contact email. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | — | All three enable SMS reminders (Pro/Business plans, customers who gave a phone number). `TWILIO_FROM` is an E.164 number or a Messaging Service SID (`MG…`). |
| `PUSH_NOTIFICATIONS` | `log` in development, else `off` | Push notifications to the mobile app (see "Push notifications"): `expo` sends them with Expo's push service, `log` logs what would be sent, `off` queues nothing. |
| `EXPO_ACCESS_TOKEN` | — | Expo access token, sent with every push request when set; required by Expo once the project's "enhanced push security" is on. |
| `ANTHROPIC_API_KEY` | — | Enables the AI business draft, the AI site builder and Bo. Without it the draft and site builder use the built-in generators and Bo opens in its "AI isn't configured" state. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model for every AI feature. |
| `AI_CREDIT_MICRO_CENTS` | development placeholder | What one AI credit is worth: model list-price cost per credit, in micro-cents (10⁻⁶ of a price-table cent). Required in production when `ANTHROPIC_API_KEY` is set. |
| `AI_CREDITS_FREE` / `AI_CREDITS_PRO` / `AI_CREDITS_BUSINESS` | development placeholders | The monthly AI credits for each plan, set in deployment config. Required in production when `ANTHROPIC_API_KEY` is set. |
| `AI_OVERAGE_METER_EVENT` | — | Stripe Billing Meter event name. With Stripe configured, paid plans keep using AI past their credits and the overage is reported to the meter (in hundredths of a credit). Unset: the allowance is a hard limit. |
| `AI_OVERAGE_MAX_CREDITS` | `10000` | Monthly cap on metered overage per business, in credits (so its cost scales with `AI_CREDIT_MICRO_CENTS`). |
| `AI_PRICES_FILE` | bundled `ai/prices.json` | A replacement price table (versioned USD prices per million tokens per model). |
| `ASSISTANT_EFFORT` | `low` | Bo's reasoning effort (`low`, `medium`, `high`). |
| `AI_FAKE_SCRIPT` | — | **Development only** (refused in production): `demo` or a JSON file path selects the scripted fake model for every AI feature (Bo plays the script; the draft and site builder fall back to their built-in generators). For UI work and e2e tests without a key. |
| `SITES_ENABLED` | `false` | Business websites and the site builder (architecture §15). Off: the public business has no `site`, `/{slug}` is the booking portal and the site routes answer 404. We don't sell websites, so leave it off. |
| `UNSPLASH_ACCESS_KEY` | — | Enables stock photo search in the site editor (see "Stock photos"). |
| `STORAGE_LOCAL_DIR` | development: `.data/uploads` | Directory for uploaded images, served by `GET /v1/public/uploads/…`. Set it explicitly to use local storage in production (single instance, persistent disk). |
| `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL` | — | S3-compatible image storage; all four are required together (partial settings refuse to start). `STORAGE_PUBLIC_BASE_URL` is where objects are publicly readable (bucket domain or CDN). |
| `STORAGE_S3_REGION` | `us-east-1` | Signing region (`auto` also works for Cloudflare R2). |
| `STORAGE_S3_ENDPOINT` | AWS | Custom endpoint for R2, MinIO, … (switches to path-style URLs), e.g. `https://<account>.r2.cloudflarestorage.com`. |
| `TRUST_FORWARDED_FOR` | `false` | Read the client address from `X-Forwarded-For` for rate limiting (see "Behind a proxy"). |
| `TRUSTED_PROXIES` | loopback + private ranges | Comma-separated IPs/CIDRs of proxies whose `X-Forwarded-For` entries are trusted. |
| `TRUSTED_PROXY_HOPS` | — | Number of proxies in front of the API (e.g. `2` for load balancer + Next.js). When set, takes precedence over `TRUSTED_PROXIES`. |
| `RATE_LIMITS_ENABLED` | `true` | Postgres-backed per-IP limits on public endpoints. |
| `RATE_LIMIT_MULTIPLIER` | `1` | Development only (refused otherwise): every limit allows this many times its requests, so the e2e suite can book repeatedly through one address with the limiter still on. |
| `JOBS_ENABLED` | `true` | Runs the in-process job worker (notifications, hold expiry, reminders, auto-complete). |
| `CORS_ALLOWED_ORIGINS` | none | Comma-separated origins allowed to call `/v1/public/*` from the browser (embeds). |
| `LOG_LEVEL` | `INFO` | Root log level. |
| `MAPBOX_ACCESS_TOKEN` | — | Geocodes business addresses for the marketplace with Mapbox (see "Geocoding"). Without it, the built-in table of Irish places is used. |
| `OAUTH_ISSUER` | `APP_BASE_URL` | Issuer of our OAuth authorization server (section 20). The consent page is `${OAUTH_ISSUER}/oauth/authorize`. |
| `PUBLIC_API_URL` | `${APP_BASE_URL}/api` | Public base URL of this API, used for the token, registration and revocation endpoints in the OAuth metadata. |
| `MCP_RESOURCE_URL` | `${APP_BASE_URL}/mcp` | Canonical URL of the signed-in customer MCP server; access tokens are bound to it. The frontend rewrites it to `/v1/mcp/customer`. |
| `BUSINESS_MCP_ENABLED` | `true` | Serves the business MCP (members' own AI agents, section 20.7). `false` is a kill switch: not served, advertised or authorized, and its tokens stop working. |
| `MCP_BUSINESS_RESOURCE_URL` | `${MCP_RESOURCE_URL}/business` | Canonical URL of the business MCP server. The frontend rewrites `/mcp/business` to `/v1/mcp/business`. |

## Authentication

Every authenticated request sends `Authorization: Bearer <token>`. The backend upserts the
`users` row (by `clerk_user_id`) on each request.

### Clerk (production)

Tokens are Clerk session JWTs (RS256), verified against the issuer's JWKS (cached, refreshed on
unknown `kid`), with `iss == CLERK_ISSUER`, `exp`/`nbf` checked with 60 s leeway, and `azp`
checked when `CLERK_AUTHORIZED_PARTIES` is set.

**The mobile app's sessions.** Clerk sets `azp` to the `Origin` of the request that minted the token. Browsers always
send one, so web tokens always carry `azp` and it must be listed. Clerk's native SDK (`@clerk/expo`) sends none, so the
app's tokens have no `azp` at all, and they are refused unless `CLERK_ACCEPT_NATIVE_SESSIONS=true`. That is safe to turn
on: `azp` guards against another site using a browser's cookie session, and this API authenticates only by the bearer
header, never cookies; a token *with* an `azp` is still checked (an empty or non-string `azp` is always refused); and a
token without one can only be minted by a client holding that user's Clerk client token, i.e. signed in as them.
Turn it on when the mobile app ships, with the Native API enabled for the Clerk instance (Clerk dashboard → Native
applications).

In the Clerk dashboard → **Sessions → Customize session token**, add:

```json
{ "email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}", "name": "{{user.full_name}}" }
```

Without these claims users have no email, so guest bookings and invitations cannot be linked.

### Dev auth (local only)

With `AUTH_MODE=dev` (only allowed when `APP_ENV=development`) the bearer token is
`dev.` + base64url(JSON) where the JSON is `{"sub":"dev_<anything>","email":"x@y.z","name":"X Y"}`.
The email is treated as verified. Example:

```bash
TOKEN="dev.$(printf '{"sub":"dev_owner","email":"owner@bookanything.test","name":"Avery Morgan"}' | base64 | tr '+/' '-_' | tr -d '=')"
curl -H "Authorization: Bearer $TOKEN" localhost:8080/v1/me
```

## Integrations (all optional; each is off until its keys are set)

### Stripe (payments and billing)

bookanything uses **Stripe Connect** with direct charges: every business gets its own connected
account, customers pay the business directly (the business is the merchant of record) and the
platform takes **no application fee**. Plans are billed on the platform account with Stripe Billing.

1. **Connect settings** (Dashboard → Connect → Settings): enable Connect, set the platform name,
   icon and brand colour (shown during onboarding), and add your frontend origin to the allowed
   redirect domains. Accounts are created with `controller` settings equivalent to Standard
   accounts: Stripe-hosted onboarding (Account Links), Stripe collects requirements, the connected
   account pays its own Stripe fees and has the full Stripe dashboard.
2. **Products** (Dashboard → Product catalogue): create the "Pro" and "Business" monthly recurring
   prices and put their ids in `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS`.
   Configure the **customer portal** (Settings → Billing → Customer portal): allow switching
   between the two prices, cancelling and updating payment methods.
3. **Webhooks** (Developers → Webhooks), URL `https://<api-host>/v1/webhooks/stripe`:
   - Endpoint listening to **Your account** events: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed` → secret in `STRIPE_WEBHOOK_SECRET`.
   - Endpoint listening to **Connected accounts** events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `checkout.session.expired`, `charge.refunded`, `account.updated` →
     secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

   Events are verified with the Stripe SDK, stored once in `provider_events` and processed by the
   job worker exactly once (retries with backoff; errors are kept in `provider_events.error`).
4. **Test mode**: use `sk_test_…` keys and test-mode price ids. Locally, forward events with the
   Stripe CLI (it prints a `whsec_…` secret to use for both variables):
   `stripe listen --forward-to localhost:8080/v1/webhooks/stripe --forward-connect-to localhost:8080/v1/webhooks/stripe`.
   Test cards: `4242 4242 4242 4242`.

Behaviour: a booking that needs online payment is held for `max(holdMinutes, 31)` minutes (Stripe
Checkout sessions must live at least 30 minutes) and gets a hosted Checkout Session on the connected
account (`expires_at` = hold expiry, `metadata.bookingId/paymentId/businessId`, success/cancel URLs
`${APP_BASE_URL}/manage/{token}?payment=succeeded|cancelled`). A payment that arrives after the slot
was taken is refunded in full automatically with an apology email. Refunds (policy, staff, declined
requests) are created on the connected account with an idempotency key; if Stripe is unreachable the
cancellation still succeeds and the refund is retried by the `payment_refund_retry` job. Refunds made
in the Stripe dashboard are recorded from `charge.refunded`.

### Email (Resend)

Create an API key, verify the sending domain of `EMAIL_FROM` in Resend, set `RESEND_API_KEY`.
Sends use an idempotency key per notification job, so retries never duplicate an email. Preview every
template with sample data at `http://localhost:8080/v1/dev/emails` (development only) or
`backend email-preview /tmp/emails`.

### SMS (Twilio)

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`. Only 24-hour reminders are sent by
SMS, only on paid plans and only when the customer gave a phone number. SMS is best effort (a
failure is logged and never re-sends the reminder email).

### Push notifications (Expo)

The mobile app registers each phone's Expo push token (`POST /v1/me/push-devices`, on every launch and sign-in; `DELETE`
on sign-out). Each notification (architecture §22) of someone with a registered phone queues a `push-send` job in the
same transaction, which sends one message per phone through `https://exp.host/--/api/v2/push/send` (up to 100 per
request, one request per app variant). Pushes show on locked phones, so they are generic: the business's name (or
"bookanything") as the title and a sentence per kind ("New booking", "A booking was cancelled", …) as the body, never
the notification's own title and body (customer names, services, times, AI agents' proposals), which stay in the app and
the email. Plus `data.link` (the app path to open), `data.notificationId`, `data.kind`, the unread count as the badge,
`channelId: "default"`, and high priority for approvals. A notification read before the job runs isn't pushed. A `push-receipts` job checks the receipts 15 minutes
later. Phones Expo reports as `DeviceNotRegistered` (on the ticket or the receipt) are revoked; other errors are logged
and not retried; Expo unreachable, 429 or 5xx is retried with the queue's backoff (5 tries). Set
`PUSH_NOTIFICATIONS=expo` (and `EXPO_ACCESS_TOKEN` if the Expo project uses enhanced push security). In development the
default `log` runs the whole flow and logs each message instead. A phone belongs to whoever signed in on it last, a
person keeps at most 20, and revoked or long-unseen phones are purged (`Retention`).

### Clerk webhook

Clerk dashboard → Webhooks → Add endpoint `https://<api-host>/v1/webhooks/clerk`, subscribe to
`user.created`, `user.updated`, `user.deleted`, and copy the signing secret into
`CLERK_WEBHOOK_SECRET`. Svix signatures are verified (HMAC-SHA256, 5-minute timestamp tolerance).
`user.deleted` anonymises the user, unlinks their customer records (businesses keep their own
booking history) and removes their memberships; a business whose **last owner** is deleted is kept
but **suspended** (audit event `business.suspended`) for support to recover.

### AI business draft (Anthropic)

Set `ANTHROPIC_API_KEY` (optionally `ANTHROPIC_MODEL`). The draft uses the official Anthropic Java SDK
with structured outputs (JSON schema), then repairs and validates the result exactly like user
input. If `websiteUrl` is given the page is fetched server-side with SSRF protection (http/https on
ports 80/443 only, every resolved address must be public, 8 s timeout, 500 KB cap). Refusals,
truncation, API errors or invalid output fall back to the template generator (logged).

### AI site builder (Anthropic)

Every business has a public site at `/[slug]` described by a validated JSON **site plan** (theme, palette, SEO and
up to 16 sections); the frontend renders it, the AI never writes HTML. `GET/PUT /v1/businesses/{id}/site` edit the
draft, every change is a version (newest 50 kept plus the published one) with a human change list, and
`POST …/site/publish` makes it public. Businesses without a published plan get a deterministic **default plan**
(theme by industry, safe copy and an FAQ derived from their real policies).

With `ANTHROPIC_API_KEY`, `POST …/site/generate` and `POST …/site/edit` use the same metered model as the
business draft (structured outputs, effort medium). The model only sees business facts, services, team, policies and
hours (never booking-form questions, answers or customer data). Its output is repaired before validation:
`CopyGuard` removes sentences with prices, guarantees, cures, rankings, awards, credentials or ratings; invented
service/team ids and testimonials are dropped; colours are made readable; images and testimonials only ever come
from the owner. Without a key, or on refusal/truncation/errors/invalid output, generation uses the default-plan
generator and edits use a small rule-based editor ("make it warmer", "move reviews higher", "hide the team",
"add a FAQ about parking", `headline to "…"`). With a model, generation and edits spend the business's AI credits
(409 `AI_LIMIT_REACHED` when used up; see "AI usage metering and credits"); the built-in designer is free. Plus 60
requests per hour per IP.

### Image storage

`POST /v1/businesses/{id}/uploads` (multipart field `file`) accepts PNG, JPEG or WebP detected from the bytes, up to
5 MB and 6000 px per side (checked from the header before decoding), verifies PNG/JPEG decode and strips metadata
(EXIF, XMP, text chunks, comments; JPEG ICC profiles are kept). Files are stored as
`businesses/{businessId}/{uuid}.{ext}`, and plans may only reference their own business's prefix.

- **S3-compatible** (AWS S3, Cloudflare R2, MinIO, …) when the four `STORAGE_S3_*`/`STORAGE_PUBLIC_BASE_URL` settings
  are present: SigV4-signed PUTs over OkHttp (no AWS SDK), `Cache-Control: public, max-age=31536000, immutable`. Make
  the bucket (or a CDN in front of it) publicly readable at `STORAGE_PUBLIC_BASE_URL`, e.g. an R2 public bucket
  domain. The access key only needs `PutObject` on the bucket.
- **Local disk** otherwise when `STORAGE_LOCAL_DIR` is set, which is the default (`.data/uploads`, relative to the
  working directory, git-ignored) in development. Files are served by `GET /v1/public/uploads/{businessId}/{file}`
  (strict file-name check, `nosniff`, immutable caching) and addressed as
  `${APP_BASE_URL}/api/v1/public/uploads/{businessId}/{file}` through the frontend's `/api` rewrite.
- **Off** in production without either: uploads answer 503 `UPLOADS_NOT_CONFIGURED` and the editor offers generated
  backgrounds only.

### Stock photos (Unsplash)

Create an app at <https://unsplash.com/developers> and set `UNSPLASH_ACCESS_KEY`. `GET …/site/stock?q=` searches
landscape photos (`content_filter=high`); the editor hotlinks `images.unsplash.com` URLs, shows "Photo by X on
Unsplash" with the photographer's profile link and calls `POST …/site/stock/download` when a photo is chosen
(Unsplash's download tracking, required by their API guidelines). New apps are limited to 50 requests an hour until
Unsplash approves them for production. Without a key the search returns `{"enabled": false, "results": []}`.

### AI usage metering and credits

Every model call goes through one seam (`ai/AiModel.kt`): features get the metering decorator `MeteredAiModel`, never
the raw `ModelClient`. Each call reserves its feature's estimate in the `ai_usage` ledger (409 `AI_LIMIT_REACHED` when
the business's monthly credits are committed), runs, and settles with the provider's token counts (input, cache write,
cache read, output) costed in micro-cents from the versioned price table (`resources/ai/prices.json`). Credits are
derived from that cost at the configured credit value (`AI_CREDIT_MICRO_CENTS`), and each plan's monthly credits come
from `AI_CREDITS_FREE` / `AI_CREDITS_PRO` / `AI_CREDITS_BUSINESS`; production refuses to start with a model but without
them. Credits are counted per calendar month in the business timezone; the site builder's built-in designer is free.
Owners and admins see this month's usage at `GET /v1/businesses/{id}/ai/usage`. Optional overage: create a Stripe
Billing Meter (sum of values, customer mapping by `stripe_customer_id`) and a metered price per 100 units on the
subscription, then set `AI_OVERAGE_METER_EVENT`.

### Bo, the business assistant

`/v1/businesses/{id}/assistant…` (architecture §17): per-member conversations streamed over SSE
(`POST …/threads/{id}/messages`, `text/event-stream`), a tool registry (`assistant/tools`) whose handlers call the same
commands as the dashboard as the signed-in member, proposals for every change (confirmed with
`POST …/actions/{id}/confirm`, audited as `ai`), an owner-editable business memory and deterministic nudges (refreshed
every 15 minutes). The system prompt is constant and the tool list depends only on the role, with a cache breakpoint
after them; check `cache_read_input_tokens` on the `ai_usage` rows to confirm caching in production.

Try it without a key: `AI_FAKE_SCRIPT=demo` (development only) and ask "book someone in tomorrow", "what's on this
week?" or "use lots of credits".

### Geocoding (Mapbox)

Marketplace locations come from the `Geocoder` seam (docs/architecture.md section 18). With `MAPBOX_ACCESS_TOKEN` (a Mapbox
access token with the Geocoding API) addresses are geocoded with the Mapbox Geocoding API v6 using **permanent** geocoding
(`permanent=true`): Mapbox only allows storing results from permanent requests, and we store one point per business. Calls
happen only when an address changes or a business lists itself, from the job worker (`geocode_business`, retried with backoff).
If Mapbox finds nothing, or without a token, the deterministic `TableGeocoder` places the business by its Eircode routing key or
city from a built-in list of Irish places (and the demo addresses exactly). Businesses whose address can't be placed are
recorded as not found and shown that way in the listing settings.

### Marketplace and deals

`GET /v1/public/marketplace/search` searches listed businesses (Pro and Business plans; commission-free) by text, category,
city or point + radius, availability (today, this week, a date), price and deals, with keyset pagination and up to three next
free times per result (cached 30 s). Owners list the business with `PUT /v1/businesses/{id}/marketplace`. Offers
(`/v1/businesses/{id}/offers`) discount matching slots automatically in the booking engine (one per booking, the best for the
customer), so checkout amounts, deposits, refunds and reports use the discounted price; public availability flags discounted
slots. See docs/architecture.md sections 18 and 19.

### MCP servers and the OAuth authorization server

- `POST /v1/mcp`: anonymous, **read-only** Model Context Protocol server (official Kotlin MCP SDK 0.15.0, stateless
  Streamable HTTP with JSON responses): `search_marketplace`, `find_business`, `list_services`, `check_availability`.
- `POST /v1/mcp/customer` (public URL `MCP_RESOURCE_URL`, default `${APP_BASE_URL}/mcp`): the **signed-in customer** server.
  It needs an access token from our own OAuth 2.1 authorization server and acts as that customer: `search_marketplace`,
  `get_business`, `check_availability`, `book` (paid services return a payment link for the human), `list_my_bookings`,
  `get_next_appointment`, `find_times_to_move`, `get_payment_link`, `reschedule_booking`, `cancel_booking`, `confirm_action`,
  `cancel_action`, `get_proposal`. Booking, moving and cancelling only prepare a request that the customer approves on
  bookanything (`/v1/me/agent-requests/{id}/approve`), unless they let that kind go ahead (`/v1/me/agent-settings`).
  Everything runs through the same services as the website; audit events use actor `api` with `via: oauth:<client_id>`.
  Sections 20.8 and 20.9.
- Notifications (section 22): `/v1/me/notifications` (the bell) and `/v1/me/notification-settings` (which kinds are also
  emailed). Approvals waiting, and customers' new bookings, requests, moves and cancellations for the team; stored with the
  event, emailed a minute later by the `inbox-email` job unless already read.
- `POST /v1/mcp/business` (public URL `MCP_BUSINESS_RESOURCE_URL`, default `${APP_BASE_URL}/mcp/business`; not while
  `BUSINESS_MCP_ENABLED=false`): owners', admins' and staff's own AI agents. Bo's tools with a `business` argument, run as the
  member with their current role and staff scope. Writes return a proposal that the member approves on bookanything at its
  `approvalUrl` (`/v1/businesses/{id}/agent-requests/{id}/approve`, signed in); kinds of single change the owner auto-approves
  (`aiAgentsAutoApprove`) go ahead with `confirm_action` instead. Audited as `ai` with `via: oauth:<client_id>`. The owner
  decides who may use agents (`aiAgentsAccess`: `admins` by default, `team`, `off`). Sections 20.7 and 20.8.
- The authorization server implements the MCP authorization spec revision **2026-07-28** (the transport is 2025-11-25 until
  the Kotlin SDK supports 2026-07-28): RFC 9728 and RFC 8414 metadata under `/.well-known/`, authorization code + PKCE (S256
  only), Client ID Metadata Documents and Dynamic Client Registration (`/v1/oauth/register`), opaque tokens hashed in the
  database (access 1 h, refresh 30 d, rotated, replay revokes the grant), RFC 8707 audience binding, RFC 9207 `iss`, RFC 7009
  revocation (`/v1/oauth/revoke`). The consent page is the frontend route `/oauth/authorize`, which signs the user in with the
  normal web login (Clerk or dev auth). Details: docs/architecture.md section 20.

Try them with the MCP Inspector (`npx @modelcontextprotocol/inspector`, transport "Streamable HTTP"): the anonymous server at
`http://localhost:8080/v1/mcp`; the customer server at `http://localhost:3000/mcp` through the frontend (the Inspector runs the
OAuth flow and opens the consent page). Clients are public (no secret); loopback redirect URIs may use any port.

### Behind a proxy (rate limits)

Rate limits are per client IP. In production the browser talks to Next.js, which rewrites `/api/*`
to this API, so the API's TCP peer is the Next.js server (or a platform load balancer). Then:

- the `/api` rewrite **must forward `X-Forwarded-For`** with the real client address appended.
  Whether it does depends on how the frontend is hosted; confirm it on the deployed stack
  with the debug log below and, if needed, forward it explicitly (e.g. a Next.js route handler or
  middleware proxy that sets `X-Forwarded-For` from the incoming request);
- set `TRUST_FORWARDED_FOR=true` and either `TRUSTED_PROXY_HOPS` (number of proxies in front of the
  API, robust when proxy IPs change) or `TRUSTED_PROXIES` (their CIDRs);
- make sure the API is **not directly reachable** from the internet, otherwise clients could pick
  their own rate-limit bucket.

The client is the first untrusted hop from the right; client-supplied entries on the left are never
used. Verify on the deployed stack with `LOG_LEVEL=DEBUG` (logs `client ip=… peer=… x-forwarded-for=…`).

## Layout

```
src/main/kotlin/ie/bookanything/
  Application.kt      entry point, CLI, plugins, routing
  AppContext.kt       composition root: seams in, feature modules out (ctx.ai, ctx.booking, ctx.site, ctx.assistant)
  ai/                 the LLM seam: AiModel (metered, what features use), ModelClient (Anthropic; fake/ scripted model),
                      the one JSON schema builder (Bo, structured outputs, MCP), strict/lenient decoders
  ai/usage/           usage ledger, versioned price table and cost, credits and allowances, reservations (AiMeter),
                      the metering decorator, overage reporting, GET /ai/usage
  assistant/          Bo: routes (SSE), conversations, prompt assembly, turn loop, views
  assistant/tools/    tool registry, read and proposal-first write tools, tool runner
  assistant/actions/  proposals (pending actions): confirm/reject
  assistant/memory/   business memory
  assistant/nudges/   nudge rules registry and service
  config/             environment configuration (one section reader per area over EnvReader), AppUrls
  db/                 DataSource, Liquibase, transaction + SQL helpers
  http/               errors, request parsing/validation, PATCH helper, date ranges, keyset pages, rate limiter
  auth/               Clerk/dev token verification, Clerk (Svix) webhook, users, roles and access
  business/           businesses, onboarding from BusinessSetup, settings, overview
  templates/          industry templates, BusinessSetup model, AI draft (Anthropic + template fallback, SSRF-safe fetch)
  resources/          resources
  availability/       rules/overrides/closures, pure SlotEngine, DB loader
  services/           services (options, add-ons, requirements), form questions
  customers/          customers, customer groups, GDPR erase/export
  booking/            booking engine, lifecycle, public/manage/staff routes
  mcp/                MCP servers: anonymous read-only tools, shared tool support (strict args, schemas), marketplace tools
  mcp/customer/       signed-in customer MCP route, tool registry and booking tools
  oauth/              OAuth 2.1 authorization server: clients (DCR, metadata documents), PKCE, redirect URIs, scopes,
                      TokenStore (Postgres), authorization/token endpoints, resource guard, metadata
  geo/                Geocoder seam (Mapbox, table of Irish places), distance maths, locations, geocode job
  marketplace/        categories, listing settings, search (SQL + availability), next free times, cursors
  offers/             deals: pure matching and pricing, validation, repository, service, routes, reschedule guard
  payments/           PaymentProvider (Stripe Connect/dev/none), ledger, refund policy, billing, Stripe webhooks
  notifications/      email templates, Resend/Twilio/log senders, outbox rendering, dev previews; inbox/ (the bell),
                      push/ (the mobile app's phones, Expo push sender, push-send and push-receipts jobs)
  jobs/               Postgres job queue and worker (SKIP LOCKED, periodic leader lock)
  team/               members and invitations
  me/                 /v1/me and customer self-service
  reports/            reports and audit queries
  site/               site plans: model and section registry, strict validation, colour contrast, default plan,
                      diff, CopyGuard, rule-based editor, versions/publish (SiteService), AI commands and allowances
  site/ai/            AI site generator (prompt, structured-output schema, repair)
  site/stock/         stock photo providers (Unsplash)
  storage/            AssetStorage (local disk, S3 SigV4, off), image sanitizer, upload routes
  seed/               seed-demo (businesses, bookings, published demo sites, marketplace listings, deals)
src/main/resources/db/changelog/db.changelog-master.sql   single baseline schema
```

## Notes

- **Compression**: responses of 1 KB or more are gzip (or deflate) encoded for clients that send `Accept-Encoding`;
  server-sent events (Bo) and images never are.
- **Double booking** is prevented by the `booking_allocations` exclusion constraint plus
  per-resource `SELECT … FOR UPDATE` in the booking transaction.
- **Row-level security** is enabled (and forced) on tenant tables; tenant-scoped transactions
  set `app.business_id`. Superusers bypass RLS, so run the app as a normal role in production.
- **Rate limits behind a proxy**: see "Behind a proxy" above.
- **Jobs**: notifications are enqueued in the same transaction as the change (outbox) and sent
  by the worker; periodic maintenance runs on whichever instance holds the advisory lock. A daily
  `purge-expired` task (`jobs/Retention`) deletes OAuth codes and tokens a day after they expire,
  applied webhook events and failed jobs after 90 days (finished jobs go after 14 days), notifications after 180 days,
  and push devices 30 days after they were revoked or 270 days after they were last seen.
- **Payments**: `PaymentProvider` has `stripe`, `dev` and `none` implementations. All Stripe API
  calls go through `StripeGateway` (tests use a fake; no live Stripe calls in tests).
- **AI, storage and stock photos** are injected through `AppContext` (a `ModelClient`, wrapped in the metered `AiModel`;
  `AssetStorage`, `StockImageProvider`); tests use fakes (including the scripted model) and loopback servers, never the
  network.
- **Local uploads** live in `.data/uploads` (development default, git-ignored). Deleting it only breaks images that
  plans still reference.
