# bookanything: Technical Architecture and API Contract

This is the **source of truth** for the rebuild. Backend and frontend are built
against this document. If implementation forces a change, update this file in
the same change.

## 1. System overview

```
Browser ──► Next.js (frontend/, bookanything.ie)
              │  /api/*  rewrite ─────────────► Ktor API (backend/, /v1/*)
              │  Clerk (sign-in UI, session JWT)        │
              ▼                                          ▼
           Clerk ◄──── JWKS verification ────────  PostgreSQL 16
                                                     ▲
Stripe ──► webhooks ───────────────────────────────  │ jobs / outbox worker (in Ktor)
Resend/Twilio ◄── notifications worker ──────────────┘
Anthropic API ◄── AI setup draft, site builder, Bo (Ktor, metered: §16-17)
S3-compatible storage / Unsplash ◄── site images (Ktor, optional)
Mapbox Geocoding ◄── marketplace locations (job worker, optional; §18)
AI assistants (MCP clients) ──► /mcp + OAuth 2.1 (our authorization server, §20)
```

- **Frontend** (`frontend/`): Next.js App Router, Tailwind v4, own shadcn-style
  component library, TanStack Query, React Hook Form + Zod, Clerk.
  Talks to the backend only through `/api/*` (rewritten to `BACKEND_ORIGIN`).
- **Backend** (`backend/`): Kotlin, Ktor 3, raw JDBC + HikariCP, Liquibase
  formatted-SQL migrations, kotlinx.serialization. Package `ie.bookanything`.
  Owns every business rule, all SQL, authorisation, payments and jobs.
- **PostgreSQL** is the only source of truth. No fake success paths.
- **Mobile** (`mobile/`): the iPhone, iPad and Android app (Expo, React Native). Talks to the API directly
  (`${API}/v1/*`, Clerk session JWT) and shares the website's `frontend/src/lib` (§23, `docs/mobile.md`).

## 2. Conventions

- All API routes are under `/v1`. JSON only. Field names camelCase.
- Responses are `Cache-Control: no-store` unless the route sets its own: templates and marketplace meta are
  `public, max-age=…` (`cachePublicly`), uploaded files `immutable`, Bo's event stream `no-cache, no-transform`.
- IDs are UUID strings. Booking `reference` is a human code like `BA-7K3F9Q`
  (Crockford base32, 6 chars, unique per business).
- Money is integer minor units (`priceCents`) plus ISO currency (`"EUR"`).
- Instants are ISO-8601 with offset, rendered in the business timezone,
  e.g. `"2026-10-01T09:00:00+01:00"`. Dates are `YYYY-MM-DD` interpreted in
  the business timezone. Times of day are `HH:mm`.
- Errors: `{"error":{"code":"SLOT_UNAVAILABLE","message":"…","fields":{}}}`.
  Never leak SQL, stack traces or internals. Every parse failure → 400
  `INVALID_REQUEST` with `fields` where possible (never 500).
- Pagination: `?limit=50&cursor=…` → `{"items":[…],"nextCursor":"…"|null}`.
- Idempotency: `POST` booking endpoints accept `Idempotency-Key` header.
  Replays with the same key return the original result (200) instead of 409.
  A public replay must also match the original customer email (it returns the
  manage token); otherwise 409 `CONFLICT`.
- Every mutation writes an `audit_events` row.
- Timezone strings are validated with `ZoneId.of` at write time; invalid →
  400 `INVALID_TIMEZONE`.

Standard error codes: `INVALID_REQUEST`, `UNAUTHENTICATED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `SLOT_UNAVAILABLE`, `RATE_LIMITED`,
`PLAN_LIMIT_REACHED`, `PAYMENTS_NOT_CONFIGURED`, `POLICY_VIOLATION`,
`SLUG_TAKEN`, `INVALID_TIMEZONE`, `DATABASE_UNAVAILABLE`,
`INTERNAL_SERVER_ERROR`, `PAYMENT_PROVIDER_ERROR` (502, Stripe failed; retry),
`INVALID_SIGNATURE` (400, webhooks), `WEBHOOKS_NOT_CONFIGURED` (503, webhook
secret not set), `AI_LIMIT_REACHED` (409, the business's monthly AI credits are used; §16),
`AI_NOT_CONFIGURED` (503, no AI model on the server, so Bo cannot chat; §17),
`UPLOADS_NOT_CONFIGURED` (503, no image storage configured; §15.7), `PAYLOAD_TOO_LARGE` (413, the request body
is over its limit: 256 KB, 64 KB for OAuth, 1 MB for site plans, business setups and webhooks; `http/BodyLimits`).

## 3. Identity, authentication and roles

### 3.1 Clerk (production)

- One Clerk application, one user pool for customers and business people.
  **No Clerk Organizations.**
- Frontend uses `@clerk/nextjs`. API calls send
  `Authorization: Bearer <Clerk session JWT>` (from `getToken()`). Clerk loads only where a session is used (the
  signed-in app, sign-in, a business's pages and managing a booking); marketing pages read Clerk's non-httpOnly
  `__client_uat` cookie to choose between "Sign in" and "Dashboard" (frontend README §6).
- Backend verifies the JWT (RS256) against JWKS at
  `${CLERK_ISSUER}/.well-known/jwks.json` (cached, refreshed on unknown `kid`),
  checks `iss == CLERK_ISSUER`, `exp`/`nbf` (60s leeway), and `azp` ∈
  `CLERK_AUTHORIZED_PARTIES` when that is set.
- **Native (mobile app) sessions.** Clerk sets `azp` to the `Origin` of the Frontend API request that minted the token,
  and leaves it out when there is none. Browsers always send an Origin, so web tokens always carry `azp`; `@clerk/expo`
  sends none, so the app's tokens have no `azp`. With `CLERK_ACCEPT_NATIVE_SESSIONS=true` (default false) a token with
  **no** `azp` claim is accepted as a native session; a token that has one must still name a listed origin, and an empty
  or non-string `azp` is always refused, so the web is checked exactly as before. Why it is safe: `azp` protects a
  browser's cookie session from use by another origin, and this API authenticates only by the bearer header, never
  cookies; a token without `azp` can only be minted by a client holding that user's Clerk client token (signed in as
  them). Turn it on in production when the mobile app ships and the Clerk instance's Native API is enabled.
- Required Clerk session-token customisation (Clerk dashboard → Sessions →
  Customize session token):
  ```json
  { "email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}", "name": "{{user.full_name}}" }
  ```
- On each authenticated request the backend upserts `users` by
  `clerk_user_id` (email, name, email_verified). A Clerk webhook
  (`POST /v1/webhooks/clerk`, Svix signature, `CLERK_WEBHOOK_SECRET`) also
  handles `user.updated` and `user.deleted` (anonymise). A deleted user stays deleted: their
  session token, valid for a minute after the deletion, gets 401 and never restores the row.

### 3.2 Dev auth (local only)

- Backend `AUTH_MODE=dev` is **refused unless `APP_ENV=development`**. A missing
  `APP_ENV` means production (fail closed), so development must be set explicitly.
- Token format: `Authorization: Bearer dev.<base64url(JSON)>` where JSON is
  `{"sub":"dev_<anything>","email":"x@y.z","name":"X Y"}`. Treated as a verified
  email.
- Frontend uses dev auth automatically when
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is unset: `/sign-in` shows an email+name
  form and demo-account quick picks, stored in `localStorage`.

### 3.3 Roles

Per business, via `business_members`:

| Role | Can |
|---|---|
| `owner` | Everything, including billing, payments setup, team, delete business. |
| `admin` | Everything except billing, payments setup, removing the owner. |
| `staff` | See the calendar and bookings **for resources linked to them**; view customers on those bookings; manage their own resource availability; create/cancel/reschedule bookings on their own resources. |

A user can be a member of several businesses and also a customer anywhere.
After sign-in: members → dashboard (switcher if >1); customers who have booked → My bookings; others → onboarding.

Team invitations: owner/admin invites an email with a role (and optional linked
resource). A pending invite is accepted automatically when a user signs in with
that **verified** email, or explicitly via `POST /v1/invitations/{token}/accept`
(which answers the same again for the user who already joined through it, so the
emailed link still works after sign-in has accepted the invite).

## 4. Data model (PostgreSQL)

Single fresh baseline changelog. Extensions: `pgcrypto`, `btree_gist`,
`citext`. Every business-owned table has `business_id` and composite FKs
`(business_id, id)` so cross-tenant references are impossible.

```
users(id, clerk_user_id UNIQUE, email CITEXT, email_verified, name, created_at, updated_at, deleted_at)

businesses(id, slug UNIQUE (reserved-word checked), name, description, industry,
  timezone, currency CHAR(3), locale, country CHAR(2),
  status ENUM(draft, active, suspended),
  contact_email, contact_phone, address_line1, address_line2, city, postcode, website_url,
  branding JSONB {primaryColor, logoUrl, coverImageUrl},
  vocabulary JSONB {resource, resources, customer, customers, booking, bookings},
  -- policies
  min_notice_minutes INT DEFAULT 60, max_advance_days INT DEFAULT 60,
  cancellation_notice_hours INT DEFAULT 24, late_cancellation_refund_percent INT DEFAULT 0,
  allow_customer_cancel BOOL DEFAULT true, allow_customer_reschedule BOOL DEFAULT true,
  hold_minutes INT DEFAULT 30, require_customer_phone BOOL DEFAULT false,
  -- money
  stripe_account_id, stripe_charges_enabled BOOL, stripe_details_submitted BOOL,
  plan ENUM(free, pro, business) DEFAULT free, stripe_customer_id, stripe_subscription_id,
  plan_status, created_at, updated_at)

business_members(id, business_id, user_id NULL, role ENUM(owner, admin, staff),
  invited_email CITEXT, invite_token_hash, status ENUM(invited, active, removed),
  created_at, updated_at, UNIQUE(business_id, user_id))

resources(id, business_id, kind ENUM(person, space, equipment), name, description,
  color, capacity INT DEFAULT 1, member_id NULL → business_members, is_active,
  sort_order, created_at, updated_at)

availability_rules(id, business_id, resource_id, day_of_week 1..7 (ISO, Mon=1),
  start_time TIME, end_time TIME, valid_from DATE NULL, valid_until DATE NULL,
  audience_group_ids UUID[] DEFAULT '{}', created_at)

availability_overrides(id, business_id, resource_id NULL (NULL = whole business closure),
  date DATE, is_available BOOL, start_time TIME NULL, end_time TIME NULL,
  reason TEXT, created_at)

customer_groups(id, business_id, name, description, restricted BOOL DEFAULT false,
  sort_order, is_active)

services(id, business_id, name, description, category, color,
  duration_minutes, buffer_before_minutes DEFAULT 0, buffer_after_minutes DEFAULT 0,
  slot_interval_minutes NULL, min_notice_minutes NULL, max_advance_days NULL,
  capacity INT DEFAULT 1, price_cents INT DEFAULT 0,
  payment_mode ENUM(full, deposit, at_venue, free) DEFAULT full, deposit_cents INT NULL,
  requires_approval BOOL DEFAULT false, location_type ENUM(business, customer, online) DEFAULT business,
  allowed_group_ids UUID[] DEFAULT '{}', is_public BOOL DEFAULT true, is_active BOOL DEFAULT true,
  sort_order, created_at, updated_at)

service_options(id, business_id, service_id, name, description, duration_minutes, price_cents, sort_order)
service_addons(id, business_id, service_id, name, description, extra_minutes, price_cents, sort_order)

service_requirements(id, business_id, service_id, label, quantity INT DEFAULT 1,
  customer_selectable BOOL DEFAULT false, sort_order)
service_requirement_resources(business_id, requirement_id, resource_id, PK(requirement_id, resource_id))

form_questions(id, business_id, service_id NULL (NULL = all services), label, help_text,
  kind ENUM(text, textarea, select, checkbox, number, phone, email), options TEXT[],
  required BOOL, sensitive BOOL, sort_order, is_active)

customers(id, business_id, user_id NULL, name, email CITEXT NULL, phone NULL, notes,
  group_id NULL, marketing_opt_in BOOL DEFAULT false, created_at, updated_at, erased_at NULL,
  sort_name GENERATED (lower(name), stored: the list's order and keyset cursor),
  UNIQUE(business_id, email) WHERE email IS NOT NULL AND erased_at IS NULL)

bookings(id, business_id, reference, customer_id, service_id, option_id NULL, option_name NULL (snapshot),
  addons JSONB (snapshot [{id,name,extraMinutes,priceCents}]), group_id NULL,
  start_at TIMESTAMPTZ, end_at TIMESTAMPTZ (service time, excl. buffers),
  status ENUM(held, pending_approval, confirmed, completed, cancelled, no_show, expired),
  hold_expires_at NULL, price_cents, deposit_cents NULL, currency,
  amount_paid_cents DEFAULT 0, amount_refunded_cents DEFAULT 0,
  payment_status ENUM(not_required, pending, paid, partially_refunded, refunded, failed, pay_at_venue),
  answers JSONB [{questionId,label,value,sensitive}], customer_notes, internal_notes,
  source ENUM(public, dashboard, api, ai), manage_token_hash, idempotency_key NULL,
  cancelled_at, cancelled_by ENUM(customer, business, system) NULL, cancellation_reason,
  reminder_sent_at NULL (24h reminder sent once),
  created_by_user_id NULL, created_at, updated_at,
  UNIQUE(business_id, reference), UNIQUE(business_id, idempotency_key))

booking_allocations(id, business_id, booking_id, resource_id, requirement_id NULL,
  time_range TSTZRANGE (includes buffers), exclusive BOOL, active BOOL,
  EXCLUDE USING gist (resource_id WITH =, time_range WITH &&) WHERE (active AND exclusive))

payments(id, business_id, booking_id, provider TEXT ('stripe'|'dev'), kind ENUM(charge, refund),
  provider_ref TEXT, checkout_url TEXT NULL, return_url TEXT NULL, amount_cents, currency,
  status ENUM(pending, succeeded, failed, cancelled), created_at, updated_at)

provider_events(id TEXT PK (provider event id), provider, type, payload JSONB,
  received_at, processed_at NULL, error NULL)

jobs(id, kind, payload JSONB, status ENUM(pending, running, done, failed), run_at,
  attempts, max_attempts DEFAULT 8, locked_at, locked_by, last_error, created_at)

audit_events(id, business_id, actor_type ENUM(owner, member, customer, guest, system, ai, api),
  actor_user_id NULL, action TEXT, entity_type TEXT, entity_id UUID, summary JSONB, occurred_at)

rate_limit_buckets(key TEXT, window_start TIMESTAMPTZ, count INT, PK(key, window_start))

email_log(id, business_id NULL, to_address, subject, template, status, provider_ref, created_at)
```

Row-level security: enable RLS on business-owned tables with a policy on
`current_setting('app.business_id', true)`; the repository layer sets it per
transaction (`SET LOCAL`). Queries also filter `business_id` explicitly.
When the setting is absent (platform-level work: slug lookup, `/v1/me`, the job
worker) the policy does not restrict. After a scoped transaction the setting
reads `''` (not NULL) on that connection, so policies compare
`business_id = nullif(current_setting('app.business_id', true), '')::uuid`
(`MigrationsRlsTest` requires it). RLS is `FORCE`d, but superusers bypass it,
so production must connect as a regular role.

## 5. Booking engine

### 5.1 Availability for a service

Input: business, service, optional option, add-ons, optional customer group,
optional preferred resource (for the `customer_selectable` requirement), date
range (max 31 days; `from`/`to` required).

1. **Effective duration** = option.duration (or service.duration) + Σ addon
   extraMinutes. **Blocked span** = [start − bufferBefore, start + duration +
   bufferAfter).
2. **Step** = `slot_interval_minutes` ?: duration (min 5).
3. **Window** per resource per date = weekly rules (respecting valid_from/until)
   minus unavailable overrides plus available overrides, minus whole-business
   closures. Rules/overrides are **merged into disjoint intervals** (no
   duplicate slots from overlapping rules).
4. **Audience** filter for rules: rule with empty `audience_group_ids` is open
   to everyone except `restricted` groups; non-empty → only those groups. A
   guest with no group = unrestricted.
5. Service `allowed_group_ids` non-empty → only those groups may book it.
6. Candidate starts: aligned to step from window start; must be ≥ now +
   min notice and ≤ today + max advance (service overrides business), and
   (customers only) on a day its release schedule has opened (§21).
7. For each candidate, for **each requirement** choose `quantity` distinct
   resources from its pool whose window contains the blocked span and that
   have no active allocation overlapping the span (exclusive), or for
   capacity > 1 services, seats remaining at that exact session. If the
   customer chose a resource for the selectable requirement, only that one.
   Deterministic choice: fewest allocated minutes that day, then sort_order, then id.
8. A slot is returned if every requirement is satisfiable.

All data for the range is loaded with a **bounded number of queries** (rules,
overrides, allocations for the range in one query each). Never per-day queries. Several requests (the services of a
deal preview, the businesses of a marketplace page) share one load: `AvailabilityService.computeAll` reads the data
for all of them in the same queries as one request, and each still sees only its own resources and business.

### 5.2 Creating a booking (transaction)

1. Validate input; resolve customer (by signed-in user, else by business+email,
   else create). An existing customer's name/phone/group are only updated when
   the booker is the verified owner of that email (guests can't overwrite them).
2. `SELECT … FOR UPDATE` the candidate resource rows ordered by id (serialises
   per resource, avoids deadlock).
3. Expire stale holds on those resources (`status=held AND hold_expires_at < now()`
   → `expired`, allocations `active=false`).
4. Recompute the slot for that exact start (same engine) inside the transaction.
5. Insert booking + allocations (exclusive when service capacity = 1).
   Exclusion constraint violation → 409 `SLOT_UNAVAILABLE`.
6. Initial status:
   - payment needed (`full`/`deposit`, price > 0) → `held` with
     `hold_expires_at = now + hold_minutes`, and a pending charge. The
     provider's checkout is created **after this transaction commits**
     (§7, "Provider calls happen after commit").
   - else `requires_approval` → `pending_approval`.
   - else `confirmed`.
7. Enqueue notifications via `jobs` in the same transaction (outbox).
8. Manage token: 32 bytes = HMAC-SHA256(`TOKEN_SECRET`, "manage:" + bookingId),
   base64url; store its SHA-256 hash (lookups use the hash). Deriving rather than
   randomly generating lets reminders and idempotent replays re-create the link
   without storing it. Invitation tokens are derived the same way ("invite:" + memberId).

Reschedule: same engine, excluding the booking's own allocations from the
busy set (a booking may move into a slot that overlaps its current time);
allocations replaced atomically. The booking keeps its duration and customer
group. The slots offered for a move use exactly the same rules:
`GET /v1/public/manage/{token}/availability`, `GET /v1/me/bookings/{id}/availability`
(customer rules) and `GET /v1/businesses/{id}/availability?excludeBookingId=`
(staff rules).

Cancellation: allocations `active=false`; refunds per policy (§7), made at the
provider after the cancellation commits.

Blocking statuses (allocations active): `held` (until expiry),
`pending_approval`, `confirmed`. Non-blocking: `completed` (past),
`cancelled`, `no_show`, `expired`.

### 5.3 Plan limits

`free`: 100 bookings created per calendar month, 3 active team members,
"Powered by bookanything" badge shown. `pro`/`business`: unlimited. Limit hit →
402-style 409 `PLAN_LIMIT_REACHED` on public booking with a friendly message.

## 6. API contract

Types referenced below are defined in §6.9. Auth column: **P** public,
**U** signed-in user, **O/A/S** business role (owner/admin/staff; higher roles
include lower).

### 6.1 Public

| Method | Path | Auth | Body / query → Response |
|---|---|---|---|
| GET | `/v1/health` | P | → `{status:"ok", database:"ok"}`; 503 `{status:"degraded", database:"unavailable"}` if DB down |
| GET | `/v1/public/templates` | P | → `TemplateSummary[]` |
| GET | `/v1/public/templates/{key}` | P | → `BusinessSetup` |
| GET | `/v1/public/businesses/{slug}` | P | → `PublicBusiness` (404 unless `active`, except members may preview drafts) |
| GET | `/v1/public/businesses/{slug}/services` | P | → `PublicService[]` (active + public only) |
| GET | `/v1/public/businesses/{slug}/availability` | P | `serviceId, optionId?, addonIds? (comma), groupId?, resourceId?, from, to, after?` → `Availability` (only slots after `after`; one slot with `policies.nextAvailableOnly`, §13) |
| POST | `/v1/public/businesses/{slug}/bookings` | P (U optional) | `CreatePublicBooking` + `Idempotency-Key` → 201 `BookingResult` |
| GET | `/v1/public/manage/{token}` | P | → `ManagedBooking` |
| POST | `/v1/public/manage/{token}/cancel` | P | `{reason?}` → `ManagedBooking` |
| POST | `/v1/public/manage/{token}/reschedule` | P | `{start, resourceId?}` → `ManagedBooking` |
| GET | `/v1/public/manage/{token}/availability` | P | `from, to, resourceId?, after?` → `Availability` (this booking's service, duration and group; its own allocations ignored; `after` and next available only as the public availability) |
| POST | `/v1/public/manage/{token}/pay` | P | → `{checkoutUrl}` (payment still pending and hold valid) |
| POST | `/v1/public/manage/{token}/payment/confirm` | P | `{sessionId}` → `ManagedBooking`: back from Checkout, the payment is read from Stripe and confirmed now (§7) |
| GET | `/v1/public/dev-payments/{paymentId}` | P (dev only) | → `{payment, booking, business}` |
| POST | `/v1/public/dev-payments/{paymentId}/complete` | P (dev only) | `{outcome:"succeeded"|"cancelled"}` → `{redirectUrl}` |
| POST | `/v1/webhooks/stripe` | signature | Stripe events (platform + Connect) → `{received, duplicate}` |
| POST | `/v1/webhooks/clerk` | signature | Clerk user events (Svix) → `{received, duplicate}` |
| POST | `/v1/mcp` | P | MCP (Streamable HTTP, stateless JSON-RPC), read-only: `search_marketplace`, `find_business`, `list_services`, `check_availability` (§20.6) |
| GET | `/v1/public/marketplace/meta`, `/v1/public/marketplace/search` | P | Marketplace (§18) |
| GET | `/v1/public/businesses/{slug}/offers` | P | Active deals (§19) |
| POST | `/v1/mcp/customer` | OAuth | Signed-in customer MCP (§20) |
| GET | `/v1/dev/emails`, `/v1/dev/emails/{template}[?format=text]` | P (dev only) | Email template previews (HTML/text, sample data); 404 in production |

Rate limits (Postgres buckets, per IP; IPv6 per /64): public booking create 20/10min,
availability 120/min, manage actions 30/10min. Per signed-in user: business creation 10/hour, AI business drafts
20/hour (also 20/hour per IP).

### 6.2 Me

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/v1/me` | U | `Me` |
| GET | `/v1/me/bookings` | U | `{upcoming: CustomerBooking[], past: CustomerBooking[]}` |
| POST | `/v1/me/bookings/{bookingId}/cancel` | U | `{reason?}` → `CustomerBooking` |
| POST | `/v1/me/bookings/{bookingId}/reschedule` | U | `{start, resourceId?}` → `CustomerBooking` |
| GET | `/v1/me/bookings/{bookingId}/availability` | U | `from, to, resourceId?, after?` → `Availability` (as the manage variant: the booking's service, duration and group, its own allocations ignored; `after` and next available only apply) |
| POST | `/v1/me/bookings/{bookingId}/pay` | U | → `{checkoutUrl}` (payment still pending and hold valid) |
| POST | `/v1/invitations/{token}/accept` | U | → `Me & { joinedBusinessId }` |

`/v1/me` auto-accepts invitations for the user's verified email. Unlinked
`customers` rows whose email equals the user's verified email are linked when
the user row is written (first sign-in, a new or newly verified email, Clerk's
user events) and on `GET /v1/me/bookings`, not on every request.

### 6.3 Onboarding and AI

| Method | Path | Auth | → |
|---|---|---|---|
| POST | `/v1/businesses` | U | `BusinessSetup` → 201 `Business` (caller becomes owner; status `active`) |
| GET | `/v1/businesses/slug-available?slug=` | U | `{available, suggestion}` |
| POST | `/v1/ai/business-draft` | U | `{description, websiteUrl?}` → `BusinessSetup` (Anthropic; falls back to best-matching template with `source:"template"` when `ANTHROPIC_API_KEY` unset) |

### 6.4 Business settings (prefix `/v1/businesses/{businessId}`)

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `` | S | `Business`. `{businessId}` may also be the slug (same access; unknown slug 404): the dashboard reads it alongside `/v1/me` |
| PATCH | `` | A | `UpdateBusiness` → `Business` |
| DELETE | `` | O | 204 (soft: status suspended); 409 while a paid plan is billing (cancel it in Billing first) |
| GET | `/overview` | S | `Overview` (today's bookings, next 7 days counts, setup checklist) |
| GET/POST | `/customer-groups` | S / A | `CustomerGroup[]` / `CustomerGroupInput` → `CustomerGroup` |
| PATCH/DELETE | `/customer-groups/{id}` | A | |
| GET/POST | `/questions` | S / A | `FormQuestion[]` / `FormQuestionInput` → `FormQuestion` |
| PATCH/DELETE | `/questions/{id}` | A | |

### 6.5 Resources and availability

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/resources` | S | `Resource[]` |
| POST | `/resources` | A | `ResourceInput` → `Resource` |
| PATCH/DELETE | `/resources/{id}` | A | (DELETE = deactivate if it has bookings) |
| GET | `/resources/{id}/availability` | S* | `{rules: AvailabilityRule[], overrides: AvailabilityOverride[]}` |
| PUT | `/resources/{id}/rules` | S* | `{rules: AvailabilityRuleInput[]}` → replaces the weekly set |
| POST | `/resources/{id}/overrides` | S* | `AvailabilityOverrideInput` → `AvailabilityOverride` |
| DELETE | `/overrides/{id}` | S* | 204 |
| GET/POST | `/closures` | S / A | business-wide closures (`AvailabilityOverride` with `resourceId:null`) |

S* = staff only for resources linked to them; admins for all.

### 6.6 Services

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/services` | S | `Service[]` (includes options, addons, requirements) |
| POST | `/services` | A | `ServiceInput` → `Service` |
| PUT | `/services/{id}` | A | `ServiceInput` → `Service` (replaces options/addons/requirements) |
| DELETE | `/services/{id}` | A | 204 (deactivates if booked) |

### 6.7 Bookings, customers, team, reports

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/bookings` | S | `from, to, status?, resourceId?, serviceId?, q?, limit, cursor` → `Page<Booking>` (staff: own resources only) |
| GET | `/bookings/{id}` | S | `BookingDetail` (booking + payments + audit trail) |
| POST | `/bookings` | S | `CreateStaffBooking` → 201 `CreatedBooking` (`checkoutUrl` set when held for `collect_online`) |
| PATCH | `/bookings/{id}` | S | `{internalNotes?, customerNotes?, answers?}` → `Booking` |
| POST | `/bookings/{id}/cancel` | S | `{reason?, refund:"policy"|"full"|"none", notifyCustomer:true}` → `Booking` |
| POST | `/bookings/{id}/reschedule` | S | `{start, resourceIds?, notifyCustomer:true}` → `Booking` |
| POST | `/bookings/{id}/approve` | S | → `Booking` |
| POST | `/bookings/{id}/decline` | S | `{reason?}` → `Booking` (reason stored as `cancellationReason` and quoted in the email) |
| POST | `/bookings/{id}/send-payment-link` | S | → `{checkoutUrl, sentTo}` (held booking with a valid hold and a customer email; emails `payment_requested`) |
| POST | `/bookings/{id}/status` | S | `{status:"completed"|"no_show"}` → `Booking` |
| GET | `/availability` | S | same query as public + `includePrivate=true`, `excludeBookingId?` (reschedule: that booking's service, duration and group, its own allocations ignored; `serviceId` optional) → `Availability` |
| GET | `/customers` | S | `q?, limit, cursor` → `Page<Customer>` (with `bookingCount`, `lastBookingAt`) |
| GET | `/customers/{id}` | S | `CustomerDetail` (customer + bookings) |
| POST | `/customers` | S | `CustomerInput` → `Customer` |
| PATCH | `/customers/{id}` | S | `CustomerInput` → `Customer` |
| DELETE | `/customers/{id}` | A | GDPR erase (anonymise name/email/phone/answers) → 204 |
| GET | `/customers/{id}/export` | A | JSON export of customer data |
| GET | `/team` | S | `TeamMember[]` |
| POST | `/team/invitations` | A | `{email, role, resourceId?}` → `TeamMember` (+ invite email) |
| PATCH | `/team/{memberId}` | A | `{role?, resourceId?}` → `TeamMember` |
| DELETE | `/team/{memberId}` | A | 204 (cannot remove last owner) |
| GET | `/reports/summary` | A | `from, to` → `ReportSummary` |
| GET | `/audit` | A | `entityId?, limit, cursor` → `Page<AuditEvent>` |

### 6.8 Payments and billing

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/payments/status` | A | `{provider:"stripe"|"dev"|"none", connected, chargesEnabled, detailsSubmitted, connectMethod:"created"|"oauth"|null, canConnectExisting, accountId, accountName}` (Stripe: read live from the account and stored) |
| POST | `/payments/connect` | O | `{returnUrl}` → `{url}` (Stripe account onboarding link; creates the connected account on first call). Stripe returns to `returnUrl?stripe=return` (or `?stripe=refresh` when the link expired: call again). 409 for an account connected with OAuth (managed in its own Stripe dashboard) |
| POST | `/payments/connect/existing` | O | `{returnUrl}` → `{url}` (Stripe Connect OAuth page with a signed single-use state); 409 when the business has an account, `PAYMENTS_NOT_CONFIGURED` without `STRIPE_CONNECT_CLIENT_ID`. Stripe sends the browser to `GET /v1/payments/stripe/callback` (no session; connects nothing), which redirects to `returnUrl?stripe=complete&code=…&state=…`, or `?stripe=connect_error&reason=denied|expired|invalid|failed` |
| POST | `/payments/connect/existing/complete` | O | `{state, code}` → `{outcome: "connected"|"expired"|"invalid"|"forbidden"|"already_connected"|"account_in_use"|"currency"|"failed", currency}`; the state must be this business's and the caller's |
| POST | `/payments/disconnect` | O | → `PaymentsStatus`: forgets the account, then closes its open checkouts and deauthorizes an OAuth account; 409 when none, or (OAuth) while upcoming bookings paid on it could need a refund |
| GET | `/billing` | O | `{plan, status, usage:{bookingsThisMonth, limit}, prices:[…]}` (each plan's features include its monthly AI credits) |
| GET | `/ai/usage` | A | `AiUsage`: this month's AI credits, per-feature usage, daily series (§16) |
| POST | `/billing/checkout` | O | `{plan:"pro"|"business", returnUrl}` → `{url}` (Stripe returns to `returnUrl?billing=success|cancelled`); 409 `CONFLICT` when a subscription already exists (use the portal) |
| POST | `/billing/portal` | O | `{returnUrl}` → `{url}`; 409 `CONFLICT` before the first checkout |

`returnUrl` must be on `APP_BASE_URL` (or an allowed embed origin).

### 6.9 Types (TypeScript notation)

```ts
type Vocabulary = { resource: string; resources: string; customer: string; customers: string; booking: string; bookings: string };
type Branding = { primaryColor: string /* #rrggbb */; logoUrl: string | null; coverImageUrl: string | null };
type Policies = {
  minNoticeMinutes: number; maxAdvanceDays: number;
  cancellationNoticeHours: number; lateCancellationRefundPercent: number; // 0..100
  allowCustomerCancel: boolean; allowCustomerReschedule: boolean;
  holdMinutes: number; requireCustomerPhone: boolean;
  nextAvailableOnly: boolean; // customers see only the earliest free time and step forward with `after` (§13)
};
type Address = { line1: string | null; line2: string | null; city: string | null; postcode: string | null };

type PublicBusiness = {
  id: string; slug: string; name: string; description: string | null; industry: string;
  timezone: string; currency: string; locale: string;
  contactEmail: string | null; contactPhone: string | null; websiteUrl: string | null; address: Address;
  branding: Branding; vocabulary: Vocabulary; policies: Policies;
  customerGroups: { id: string; name: string; description: string | null }[];
  paymentsEnabled: boolean; showBadge: boolean;
};

type Business = PublicBusiness & {
  status: "draft" | "active" | "suspended"; country: string;
  plan: "free" | "pro" | "business"; myRole: "owner" | "admin" | "staff";
  createdAt: string;
};
type UpdateBusiness = Partial<{
  name: string; slug: string; description: string | null; timezone: string; currency: string; locale: string;
  contactEmail: string | null; contactPhone: string | null; websiteUrl: string | null; address: Address;
  branding: Branding; vocabulary: Vocabulary; policies: Policies; status: "draft" | "active";
}>;

type ResourceKind = "person" | "space" | "equipment";
type Resource = { id: string; kind: ResourceKind; name: string; description: string | null; color: string;
  capacity: number; memberId: string | null; isActive: boolean; sortOrder: number };
type ResourceInput = Omit<Resource, "id">;

type AvailabilityRule = { id: string; resourceId: string; dayOfWeek: 1|2|3|4|5|6|7; startTime: string; endTime: string;
  validFrom: string | null; validUntil: string | null; audienceGroupIds: string[] };
type AvailabilityRuleInput = Omit<AvailabilityRule, "id" | "resourceId">;
type AvailabilityOverride = { id: string; resourceId: string | null; date: string; isAvailable: boolean;
  startTime: string | null; endTime: string | null; reason: string | null };
type AvailabilityOverrideInput = Omit<AvailabilityOverride, "id" | "resourceId">;

type CustomerGroup = { id: string; name: string; description: string | null; restricted: boolean; sortOrder: number; isActive: boolean };
type CustomerGroupInput = Omit<CustomerGroup, "id">;

type PaymentMode = "full" | "deposit" | "at_venue" | "free";
type ServiceOption = { id: string; name: string; description: string | null; durationMinutes: number; priceCents: number; sortOrder: number };
type ServiceAddon = { id: string; name: string; description: string | null; extraMinutes: number; priceCents: number; sortOrder: number };
type ServiceRequirement = { id: string; label: string; quantity: number; customerSelectable: boolean; resourceIds: string[]; sortOrder: number };
type Service = {
  id: string; name: string; description: string | null; category: string | null; color: string;
  durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number;
  slotIntervalMinutes: number | null; minNoticeMinutes: number | null; maxAdvanceDays: number | null;
  capacity: number; priceCents: number; paymentMode: PaymentMode; depositCents: number | null;
  requiresApproval: boolean; locationType: "business" | "customer" | "online";
  allowedGroupIds: string[]; isPublic: boolean; isActive: boolean; sortOrder: number;
  options: ServiceOption[]; addons: ServiceAddon[]; requirements: ServiceRequirement[];
};
type ServiceInput = Omit<Service, "id" | "options" | "addons" | "requirements"> & {
  options: Omit<ServiceOption, "id">[]; addons: Omit<ServiceAddon, "id">[]; requirements: Omit<ServiceRequirement, "id">[];
};

type FormQuestion = { id: string; serviceId: string | null; label: string; helpText: string | null;
  kind: "text" | "textarea" | "select" | "checkbox" | "number" | "phone" | "email";
  options: string[]; required: boolean; sensitive: boolean; sortOrder: number; isActive: boolean };
type FormQuestionInput = Omit<FormQuestion, "id">;

type PublicService = Omit<Service, "requirements" | "allowedGroupIds" | "isPublic" | "isActive"> & {
  allowedGroupIds: string[];
  selectableRequirement: { id: string; label: string; resources: { id: string; name: string; description: string | null; kind: ResourceKind }[] } | null;
  questions: Omit<FormQuestion, "serviceId" | "isActive">[];
};

type Slot = { start: string; end: string; resourceIds: string[] /* one assignment example */; seatsLeft: number | null };
type Availability = { timezone: string; from: string; to: string; durationMinutes: number; days: { date: string; slots: Slot[]; opensAt: string | null; held: boolean }[];
  nextAvailableOnly: boolean /* limited by the business's policy: at most one slot; false on staff availability */ };

type CustomerInput = { name: string; email: string | null; phone: string | null; notes?: string | null; groupId?: string | null };
type CreatePublicBooking = {
  serviceId: string; optionId: string | null; addonIds: string[]; groupId: string | null; resourceId: string | null;
  start: string; customer: { name: string; email: string; phone: string | null };
  answers: Record<string /*questionId*/, string>; customerNotes: string | null;
  returnUrl?: string; // frontend origin used to build success/cancel URLs
};
type BookingStatus = "held" | "pending_approval" | "confirmed" | "completed" | "cancelled" | "no_show" | "expired";
type PaymentStatus = "not_required" | "pending" | "paid" | "partially_refunded" | "refunded" | "failed" | "pay_at_venue";
type BookingResult = {
  booking: CustomerBooking; manageToken: string;
  next: { type: "confirmed" | "pending_approval" | "payment_required"; checkoutUrl: string | null };
};

type CustomerBooking = {
  id: string; reference: string; status: BookingStatus; paymentStatus: PaymentStatus;
  start: string; end: string; timezone: string;
  business: { id: string; slug: string; name: string; branding: Branding; contactEmail: string | null; contactPhone: string | null; address: Address };
  service: { id: string; name: string }; option: { id: string; name: string } | null; addons: { id: string; name: string }[];
  resources: { id: string; name: string; kind: ResourceKind }[];
  priceCents: number; depositCents: number | null; amountPaidCents: number; amountPaidInPersonCents: number; amountRefundedCents: number; currency: string;
  holdExpiresAt: string | null;
  canCancel: boolean; canReschedule: boolean;
  refundPreview: { amountCents: number; reason: string } | null; // what a cancellation now would refund
};
type ManagedBooking = CustomerBooking & { customer: { name: string; email: string | null; phone: string | null } };

type Booking = {
  id: string; reference: string; status: BookingStatus; paymentStatus: PaymentStatus; source: "public" | "dashboard" | "api" | "ai";
  start: string; end: string; bufferBeforeMinutes: number; bufferAfterMinutes: number;
  customer: { id: string; name: string; email: string | null; phone: string | null; groupId: string | null };
  service: { id: string; name: string; color: string }; option: { id: string; name: string } | null;
  addons: { id: string; name: string; extraMinutes: number; priceCents: number }[];
  resources: { id: string; name: string; kind: ResourceKind; requirementId: string | null }[];
  groupId: string | null; answers: { questionId: string; label: string; value: string; sensitive: boolean }[];
  customerNotes: string | null; internalNotes: string | null;
  priceCents: number; depositCents: number | null; amountPaidCents: number; amountPaidInPersonCents: number; amountRefundedCents: number; currency: string;
  holdExpiresAt: string | null; cancelledAt: string | null; cancelledBy: "customer" | "business" | "system" | null; cancellationReason: string | null;
  createdAt: string; updatedAt: string;
};
type Payment = { id: string; kind: "charge" | "refund"; provider: string; amountCents: number; currency: string; status: string; createdAt: string };
type AuditEvent = { id: string; actorType: string; actorName: string | null; action: string; entityType: string; entityId: string; summary: Record<string, unknown>; occurredAt: string };
type BookingDetail = Booking & { payments: Payment[]; history: AuditEvent[];
  checkoutUrl: string | null /* pending checkout link while held and the hold is valid */ };
type CreatedBooking = Booking & { checkoutUrl: string | null }; // POST /bookings
type CreateStaffBooking = {
  serviceId: string; optionId: string | null; addonIds: string[]; groupId: string | null; resourceIds: string[] | null;
  start: string; customerId: string | null; customer: CustomerInput | null; answers: Record<string, string>;
  internalNotes: string | null; paymentMode: "collect_online" | "at_venue" | "none"; notifyCustomer: boolean;
};

type Customer = { id: string; name: string; email: string | null; phone: string | null; notes: string | null; groupId: string | null;
  hasAccount: boolean; bookingCount: number; lastBookingAt: string | null; createdAt: string };
type CustomerDetail = Customer & { bookings: Booking[] };

type TeamMember = { id: string; userId: string | null; name: string | null; email: string; role: "owner" | "admin" | "staff";
  status: "invited" | "active"; resourceId: string | null; createdAt: string };

type Me = {
  user: { id: string; email: string; name: string | null; emailVerified: boolean };
  memberships: { businessId: string; slug: string; name: string; role: "owner" | "admin" | "staff"; branding: Branding }[];
  pendingInvitations: { token: string; businessName: string; role: string }[];
  hasCustomerBookings: boolean;
};

type Overview = {
  today: Booking[]; upcomingCount7d: number; revenueCents30d: number; bookings30d: number;
  checklist: { key: "services" | "resources" | "availability" | "payments" | "branding" | "publish"; done: boolean }[];
};
type ReportSummary = {
  from: string; to: string; currency: string;
  totals: { bookings: number; confirmed: number; cancelled: number; noShows: number; revenueCents: number; refundedCents: number; newCustomers: number };
  byDay: { date: string; bookings: number; revenueCents: number }[];
  byService: { serviceId: string; name: string; bookings: number; revenueCents: number }[];
  byResource: { resourceId: string; name: string; bookedMinutes: number; availableMinutes: number; utilisation: number }[];
};
type Page<T> = { items: T[]; nextCursor: string | null };

type TemplateSummary = { key: string; name: string; description: string; icon: string };
type BusinessSetup = {
  source?: "template" | "ai";
  name: string; slug: string | null; industry: string; description: string | null;
  timezone: string; currency: string; locale: string; country: string;
  vocabulary: Vocabulary; branding: Branding; policies: Policies;
  customerGroups: { key: string; name: string; description: string | null; restricted: boolean }[];
  resources: { key: string; kind: ResourceKind; name: string; description: string | null; capacity: number;
    weeklyHours: { dayOfWeek: number; startTime: string; endTime: string; audienceGroupKeys: string[] }[] }[];
  services: (Omit<ServiceInput, "requirements" | "allowedGroupIds" | "isActive" | "sortOrder"> & {
    requirements: { label: string; quantity: number; customerSelectable: boolean; resourceKeys: string[] }[];
    allowedGroupKeys: string[];
  })[];
  questions: (Omit<FormQuestionInput, "serviceId" | "isActive" | "sortOrder"> & { serviceName: string | null })[];
};
```

## 7. Payments

- `PaymentProvider` interface with `StripePaymentProvider` and
  `DevPaymentProvider`. Selection: `STRIPE_SECRET_KEY` set → Stripe; else if
  `APP_ENV=development` → Dev; else payments unavailable
  (`PAYMENTS_NOT_CONFIGURED` when a paid service is booked, and paid services
  cannot be published: services needing online payment are omitted from
  `GET /v1/public/businesses/{slug}/services` while the business cannot take payments).
- **Stripe Connect**: the owner either has us create an account (Stripe-hosted
  onboarding, Account Links; `stripe_connect_method = 'created'`) or connects
  one they already have (Connect OAuth, `'oauth'`; offered when
  `STRIPE_CONNECT_CLIENT_ID` is set). The business is merchant of record:
  charges are created **on the connected account** (`Stripe-Account` header),
  **no application fee**. `account.updated` updates `stripe_charges_enabled`.
  One business per account (unique `stripe_account_id`).
- **Connecting an existing account** (`ConnectExisting`; Stripe's OAuth for
  Standard accounts, still the way to link an account a platform didn't create;
  Accounts v2 has no replacement and Stripe keeps OAuth platforms on v1):
  1. `POST /payments/connect/existing` (owner): a random nonce is stored hashed
     in `stripe_connect_states` with the business, the owner and the return
     URL; the `state` is `base64url(v1.business.owner.nonce.expiry)` + an
     HMAC (`TOKEN_SECRET`), valid 10 minutes.
  2. Stripe redirects to `GET /v1/payments/stripe/callback` (through the app's
     `/api` rewrite). It has no session, so it connects nothing: a state that
     fails the MAC goes to `/dashboard` (`reason=invalid`); a used or expired
     one, or Stripe's `access_denied` (which spends it), goes back with
     `connect_error`; otherwise the code and state are passed to the owner's
     page (`?stripe=complete&code=&state=`).
  3. That page, signed in, calls `POST /payments/connect/existing/complete`.
     The state must be this business's and this caller's: someone who starts
     the flow and gets a victim to approve it at Stripe can't use the code (the
     victim isn't them), so a victim's account can't be attached to their
     business. The state is spent (once, row locked), the caller must still be
     an owner and the business still without an account (checked before the
     code is exchanged).
  4. The code is exchanged once (`stripe.oauth.token`, no network retries:
     Stripe revokes a connection whose code is used twice) for
     `stripe_user_id` only; the deprecated access/refresh tokens are never
     read or stored. The account is read (`charges_enabled`,
     `details_submitted`, country, default currency) and linked unless another
     business here has it (`account_in_use`) or it settles in another currency
     than the business charges in (`currency`). The same account linked a
     moment ago (a second tab) is success. Whenever Stripe connected an account
     we then don't link (currency, Stripe failing to describe it, a database
     error), the connection is deauthorized again, unless a business here uses
     that account. Audit `payments.connected` / `payments.connect_failed`.
  - **Each charge remembers its account** (`payments.provider_account`, copied
    to its refunds): refunds, closing its checkout and Stripe's events about it
    use that account, whatever the business is connected to now.
  - **Disconnect** (`POST /payments/disconnect`, owner): the account is
    forgotten in one transaction (its generation counter,
    `stripe_account_generation`, goes into the idempotency key that creates an
    account, so "create one for me" afterwards gets a new one). An account we
    created stays the owner's, with its full dashboard, and we keep access: its
    open Checkout Sessions are expired after the commit (one paid meanwhile
    still confirms its booking) and its charges can still be refunded. For an
    OAuth account our access ends, so nothing may still need it: its open
    sessions are expired first (409 when one was just paid), and it is refused
    (409) while a refund on it waits or an upcoming booking paid on it could be
    refunded; after the commit it is deauthorized (`stripe.oauth.deauthorize`),
    so Stripe's event finds no business.
  - **Deauthorizing is guarded**: an account is never deauthorized (on
    disconnect, or when undoing a connection) while a business here is linked
    to it or money on it could still need it, for any business (a pending
    refund, an open checkout, an upcoming booking paid there).
  - **The return page** for connecting an existing account is always the
    business's own payments settings page on `APP_BASE_URL`, never an embed
    origin, since Stripe's code is passed back there.
  - **`account.application.deauthorized`** (either way of connecting, from
    Stripe's side): the business forgets the account (paid services are hidden
    again), audit `payments.disconnected` (`reason: deauthorized`), and its
    owners get a `payments_alert` notification. An event from no later than
    the current link's second (`stripe_connected_at`) is about an earlier link
    and is ignored.
- **Checkout**: hosted Stripe Checkout Session per booking payment
  (`mode=payment`, `expires_at = hold expiry`, minimum 30 minutes, so
  the effective hold is `max(hold_minutes, 31)` when Stripe is active).
  `metadata.bookingId/paymentId/businessId` (also on the PaymentIntent),
  success/cancel URLs `${APP_BASE_URL}/manage/{token}?payment=succeeded|cancelled`
  (Stripe adds `&session_id=` to the success URL). The session's `expires_at`
  is clamped to Stripe's window (at least 30 minutes from when it is created):
  when it is created late (a slow or replayed request), the hold is extended to
  match it, so a customer can never pay a session whose hold has ended.
- **Back from Checkout**: the manage page (web and app) sends the `session_id`
  to `POST /v1/public/manage/{token}/payment/confirm`; the session is read from
  Stripe and, when paid, applied through the same path as
  `checkout.session.completed` (`CheckoutCompletion`: exactly the amount and
  currency, else refunded in full; once, whichever comes first). The page
  polls for a minute at most, then says it is taking longer and the
  confirmation will come by email.
- **What an unpaid hold shows**: an expired or abandoned hold owes nothing
  (`payment_status = not_required`; a late payment sets it `paid`); a delayed
  payment that fails (`checkout.session.async_payment_failed`) sets the charge
  and the booking `failed`.
  `payments.provider_ref` holds the Checkout Session id until the payment
  completes, then the PaymentIntent id (used for refunds and `charge.refunded`).
- Webhooks (`STRIPE_WEBHOOK_SECRET`, plus `STRIPE_CONNECT_WEBHOOK_SECRET` for
  the Connect endpoint if separate): store in `provider_events` (idempotent by
  event id) and process via jobs:
  `checkout.session.completed` → payment succeeded, booking `confirmed`
  (or `pending_approval`), send confirmation; if the hold had already expired
  and the slot is gone → automatic full refund + apology email.
  `checkout.session.expired` → payment cancelled, booking `expired`.
  `charge.refunded` → reconcile refund amounts. `refund.updated` /
  `refund.failed` / `charge.refund.updated` → a refund that failed (below).
  A completed checkout for another amount or currency than its payment pays
  for nothing: the booking's own charge is left alone, the money gets a failed
  charge row of its own (by PaymentIntent, in its currency), is refunded in full
  on its account (`stripe_unmatched_refund` job, idempotent by PaymentIntent)
  and the owners get a `payments_alert`.
  `customer.subscription.*` → business plan.
  Payment events are only accepted from the connected account that owns the
  business (`event.account`), for exactly the payment's amount and currency.
  Billing events (`customer.subscription.*`, subscription checkouts,
  `invoice.payment_failed`) are only accepted from the platform account (no
  `event.account`); `account.updated` only from the account it describes.
  `account.application.deauthorized` → the account is disconnected (above).
- **Refund policy** on cancellation:
  - business cancels → full refund of amount paid.
  - customer cancels ≥ `cancellation_notice_hours` before start → full refund.
  - later → `late_cancellation_refund_percent` of amount paid.
  - staff may override with `refund: "full" | "none"`.
- **Platform billing**: Stripe Billing on the platform account. Checkout
  Session `mode=subscription` with `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS`;
  Billing Portal for management. A business whose paid plan is still billing
  (active, trialing, past due) can't be deleted (409 "Cancel your plan in
  Billing first"): deleting only suspends it, which would leave Stripe
  charging and take the owner's billing portal away.

### Provider calls happen after commit

No call to the payment provider is made inside a transaction that holds a
booking's or a resource's locks: a slow provider (the Stripe client allows up
to ~50 s) would otherwise queue every booking on those resources behind it.
The transaction records what is to be done; the call follows the commit, and a
short second transaction records the answer (locking the booking, then the
payment, the order every payment path uses). `conn.afterCommit { }` (`db`)
runs an action once the transaction on that connection has committed (never
after a rollback, nor after a rolled-back savepoint, as in a failed Bo action).

**Creating a held booking** (`BookingEngine.createInTx`):

1. Transaction 1 (resource locks, as in §5.2): the `held` booking, its
   allocations and a `pending` charge without a checkout. Commit: the hold now
   protects the slot.
2. No transaction: `PaymentProvider.createCheckout`.
3. Transaction 2: lock the booking and the charge, store the session
   (`provider_ref`, `checkout_url`) and queue `payment_requested` (a held staff
   booking's email carries the link, so it waits for it). If the booking was
   cancelled meanwhile, the session is stored and closed (below) and the
   response shows the booking as it is.

- Provider failure: the hold is released as an abandoned checkout's is
  (`expired`, allocations released, charge `cancelled`, audit `booking.expired`
  with reason `checkout_failed`), its Idempotency-Key is freed, and the error
  (`PAYMENT_PROVIDER_ERROR`) is returned as before; a retry with the same key
  books again.
- Idempotent replay while the first request is between steps 1 and 3: it waits
  (polling, outside any transaction, up to 60 s) for the stored link and
  returns the same one; if the first request failed it books afresh.
- Process stopped between steps 1 and 2: replays answer 409 `CONFLICT` ("still
  being set up") until the hold expires normally; then they say `expired`.
- Bo's `create_booking` runs inside the confirm transaction, so steps 2-3 are
  its after-commit action.

**Refunds** (cancel, decline, Bo's bulk cancel, a payment that arrived after its
slot was gone) go through `RefundSettlement`:

1. In the lifecycle transaction: a `pending` refund row and a
   `payment_refund_retry` job (outbox; queued one minute out as a backstop),
   carrying the customer's email about it (the cancellation, decline or
   late-payment apology) as its `notice`. Nothing to refund: the email is
   queued at once.
2. After commit, the request runs that job straight away (`JobRunner.runNow`
   claims it by id): the provider call outside any transaction (the refund id is
   the idempotency key), then a short transaction records the answer
   (`applyRefundResult`; a refund `charge.refunded` already settled is left
   alone), audits `payment.refunded`, and queues the notice with the outcome:
   "a refund of €X is on its way" (Stripe `succeeded`, or `pending` /
   `requires_action`: accepted, counted as refunded), "being processed" when
   the provider was unreachable, or, when it refused the refund, that the
   business will arrange it. The notice is removed from the job's payload in
   the same transaction, so it is sent once.
3. Provider unreachable: the job is retried with backoff (30 attempts, about a
   day; never sent again 23 hours after the refund was recorded, as Stripe keeps
   idempotency keys for 24); when a
   retry succeeds the customer gets a `payment_refunded` receipt. Process
   stopped before step 2: the worker runs the job when the backstop is due.
4. **Failed for good**: never retried. `RefundSettlement.failed` marks the
   refund `failed`, takes it off the booking's refunded total (the booking is
   `paid` again when nothing is left refunded), audits `payment.refund_failed`
   and sends the owners a `payments_alert` linking to the booking. When it is
   certain (Stripe answered `failed`/`canceled` or refused the request for good:
   a 4xx such as no access to the account, `balance_insufficient` aside, which
   is retried; or nothing is left to refund it from), the alert says to refund
   the customer another way and the customer is told the business will arrange
   it: in the notice, or with a `payment_refund_failed` email when they had
   already been told it was coming (its late-payment version for an apology
   refund). When we can't tell (still unreachable at the end, or Stripe says
   the charge was refunded already), the alert asks the owners to check the
   payment in their Stripe dashboard first, and the customer hears the refund
   is being checked (in the notice, or by email when they were told it was
   on its way); an unreachable Stripe is reported as an error. If Stripe did
   make it, its `charge.refunded` records it and the customer gets a receipt.
   Both are counted (`payments_refunds_given_up_total`, alerted on), as are
   failed refunds of unmatched payments.
5. **A refund Stripe accepted and later fails** (`refund.updated`,
   `refund.failed` or `charge.refund.updated` with status `failed`/`canceled`,
   from the account the refund was made on): found by the refund's id or the
   `refundPaymentId` in its metadata (a dashboard refund by its charge and
   amount, split off a recorded total that covered several, then known by its
   id; while the Stripe refund is under an hour old the event is retried until
   its `charge.refunded` has recorded it, then it is logged and dropped; one we
   gave up on unsure that Stripe had made is found the same way, through the
   record its `charge.refunded` made; a failed refund of an unmatched payment
   goes to the owners as a `payments_alert`), and failed as in
   4 (certain), once: the booking is locked before the refund is looked up, as
   Stripe sends each failure as several events. The customer hears it in the notice when our job is still to send
   it, else by email. Other statuses change nothing (an accepted refund
   already counts).

Responses that report the refund (the cancel and decline routes, the manage
link, `/me`, the customer MCP) read the booking again after the commit
(`Db.current`), so they show it as before.

**Closing a cancelled booking's checkout** (`CheckoutExpiry`): cancelling a
`held` booking cancels its pending charge and queues `payment_checkout_expire`;
the worker expires the Checkout Session at Stripe if it is still `open` (a
completed one is left alone: that payment is refunded as a late payment).
Holds that simply expire need nothing: their session's `expires_at` is the
hold's end.
- **Dev provider**: checkout URL points to the frontend page
  `/dev/checkout/{paymentId}`, which calls the dev-payments endpoints. Refused
  when `APP_ENV=production`.

## 8. Jobs, notifications, scheduling

- `jobs` table polled by an in-process worker (`FOR UPDATE SKIP LOCKED`,
  exponential backoff, `max_attempts`). Safe with multiple instances.
- Periodic jobs (scheduled by the worker with advisory-lock leader election):
  expire holds (every minute), send reminders (24h before start, once),
  mark past confirmed bookings `completed` (hourly), purge old rate-limit rows. They run in their own loop beside
  the queue's, so a slow task (refreshing nudges) never delays jobs such as emails and payment events.
- Notification kinds: booking_confirmed, booking_pending_approval,
  booking_approved, booking_declined, booking_cancelled, booking_rescheduled,
  booking_reminder, payment_requested, payment_refunded, payment_refund_failed,
  team_invitation, new_booking_for_business. `payment_requested` carries the checkout link of a
  held booking created by the business (`collect_online`), is queued once the
  link exists (§7) and is only sent while the booking is still held. Emails
  about a refund are queued with the provider's answer (§7, "Refunds").
- Payment jobs: `payment_refund_retry` (send a recorded refund; run straight
  after its commit, retried here for about a day), `payment_checkout_expire`
  (close a cancelled booking's checkout), `stripe_unmatched_refund` (refund in
  full a payment that matched no booking).
  Email templates (`email_log.template`) are the same keys plus
  `payment_refunded_apology` (late payment refunded because the slot was gone).
- `EmailSender`: `ResendEmailSender` when `RESEND_API_KEY` set, else
  `LogEmailSender` (logs + `email_log`). From: `EMAIL_FROM`
  (default `bookanything <bookings@bookanything.ie>`).
- `SmsSender`: `TwilioSmsSender` when Twilio env set, else no-op. SMS only for
  reminders when the customer gave a phone number and the plan allows it.
- Emails are HTML + text, business-branded (name, primary colour), include
  the manage link `${APP_BASE_URL}/manage/{token}` and never include
  sensitive answers.

## 9. AI

- `POST /v1/ai/business-draft`: Anthropic Messages API (official Java SDK)
  with structured outputs (`output_config.format` JSON schema, `effort:
  medium`), returning a `BusinessSetup` with `source:"ai"`. Output is repaired
  (clamped values, unknown keys dropped) and validated server-side exactly like
  user input; the user reviews before creating. Refusal, `max_tokens`, API
  errors or invalid output fall back to the template generator
  (`source:"template"`). An optional `websiteUrl` is fetched server-side with
  SSRF protection and passed as untrusted context.
- Never send `sensitive` answers or customer data to a model (Bo sees booking data the member may see, minus
  sensitive answers; §17).
- Env: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- **One metered seam.** Every feature calls the model through `AiModel`, whose only implementation is the metering
  decorator around the raw `ModelClient` (Anthropic, or the development-only scripted fake): each call is reserved,
  enforced against the business's AI credits and settled with the provider's token counts (§16). The business draft
  is recorded against the user (no business yet, no allowance).
- **MCP server** (updated in §20: `/v1/mcp` is now read-only and booking moved to the signed-in customer MCP;
  the original design follows) `POST /v1/mcp` (official Kotlin MCP SDK, stateless Streamable
  HTTP, JSON responses, no sessions so it scales like the REST API). Public tools:
  `find_business(slug)`, `list_services(slug)`, `check_availability(slug, serviceId,
  from, to, optionId?, addonIds?, groupId?, resourceId?)` and
  `create_booking_request(slug, serviceId, start, customer{name,email,phone?},
  optionId?, addonIds?, groupId?, resourceId?, answers?, customerNotes?,
  idempotencyKey?)`. They call the same code as the public REST endpoints
  (`PublicBookingService`), so every rule applies; bookings get `source=api` and audit
  actor `api`, and the result carries the manage link and, for paid services, the
  checkout link. Rate limits: 120 MCP requests/min per IP, plus the public booking
  limit and 10 MCP bookings/10 min per IP. Tool errors are returned as
  `isError` results with the API error code.
- **Bo**, the owner/staff assistant in the dashboard: §17. Customers bring their own AI instead of a chat of ours: the
  customer MCP (§20) and WebMCP on our pages (§20.10).

## 10. Configuration (backend env)

```
APP_ENV=development|production            APP_BASE_URL=http://localhost:3000
PORT=8080  APP_HOST=0.0.0.0               DATABASE_URL / DATABASE_USERNAME / DATABASE_PASSWORD
DATABASE_POOL_SIZE=10                     RUN_MIGRATIONS_ON_START=true (dev) / false (prod: run `migrate` command)
AUTH_MODE=clerk|dev                       CLERK_ISSUER, CLERK_AUTHORIZED_PARTIES, CLERK_WEBHOOK_SECRET
CLERK_ACCEPT_NATIVE_SESSIONS=false (accept tokens with no azp: the mobile app's; §3.1)
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS
STRIPE_CONNECT_CLIENT_ID (ca_…; "connect an existing account")   STRIPE_CONNECT_REDIRECT_URI (default ${PUBLIC_API_URL}/v1/payments/stripe/callback)
RESEND_API_KEY, EMAIL_FROM                TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
PUSH_NOTIFICATIONS=expo|log|off (default log in development, off otherwise; §22)   EXPO_ACCESS_TOKEN
ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-opus-5-5)   UNSPLASH_ACCESS_KEY (stock photos)
SITES_ENABLED=false (business websites and the site builder, §15; off: /[slug] is the booking portal)
ASSISTANT_ENABLED=false (Bo, §17; off: the /assistant routes answer 404, no nudges, nothing metered for Bo; owners
  connect their own AI assistant to the business MCP instead, §20.7)
AI_CREDIT_MICRO_CENTS (what a credit is worth), AI_CREDITS_FREE, AI_CREDITS_PRO, AI_CREDITS_BUSINESS (monthly
  credits per plan): development placeholders by default, required in production with a model (§16)
AI_OVERAGE_METER_EVENT (Stripe Billing Meter event name; unset = hard limit), AI_OVERAGE_MAX_CREDITS=10000
AI_PRICES_FILE (override the bundled price table)   ASSISTANT_EFFORT=low|medium|high (Bo's reasoning effort)
AI_FAKE_SCRIPT (development only: `demo` or a JSON file; the scripted fake model, refused in production)
STORAGE_LOCAL_DIR (dev default .data/uploads)   STORAGE_S3_BUCKET, STORAGE_S3_REGION, STORAGE_S3_ENDPOINT,
STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY, STORAGE_PUBLIC_BASE_URL (image uploads; §15.7)
TRUST_FORWARDED_FOR=false, TRUSTED_PROXIES (CIDRs; default loopback+private), TRUSTED_PROXY_HOPS
JOBS_ENABLED=true                         CORS_ALLOWED_ORIGINS (embeds; default none)
TOKEN_SECRET (required in production; HMAC key for manage/invite tokens)
CLERK_JWKS_URL (default ${CLERK_ISSUER}/.well-known/jwks.json)   RATE_LIMITS_ENABLED=true   LOG_LEVEL=INFO
MAPBOX_ACCESS_TOKEN (marketplace geocoding; §18)
OAUTH_ISSUER (default APP_BASE_URL)   PUBLIC_API_URL (default ${APP_BASE_URL}/api)   MCP_RESOURCE_URL (default ${APP_BASE_URL}/mcp)  (§20)
```

CLI commands: `migrate`, `seed-demo` (development only), `email-preview [dir]`.

Production: the Next.js `/api` rewrite must forward `X-Forwarded-For`, and
the API must not be directly reachable, when `TRUST_FORWARDED_FOR=true`.

Frontend env: `BACKEND_ORIGIN`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_ASSISTANT_ENABLED=false` (build time: whether the
public pages present Bo; set it with the backend's `ASSISTANT_ENABLED`).

## 11. Frontend routes

| Route | Purpose |
|---|---|
| `/` | Marketing landing |
| `/pricing` | Plans |
| `/for/[industry]` | Industry pages: `physio`, `car-wash`, `music-lessons`, `gp-practice` |
| `/legal/terms`, `/legal/privacy` | Draft legal pages |
| `/sign-in`, `/sign-up` | Clerk or dev sign-in |
| `/onboarding` | Create a business: template or AI description → review → create → payments |
| `/dashboard` | Redirect to the first business or onboarding |
| `/dashboard/[slug]` | Overview |
| `/dashboard/[slug]/calendar` | Resource day/week calendar |
| `/dashboard/[slug]/bookings` | List + filters |
| `/dashboard/[slug]/customers` (`/[id]`) | Customers |
| `/dashboard/[slug]/services` | Services editor |
| `/dashboard/[slug]/resources` | Resources + availability |
| `/dashboard/[slug]/team` | Team |
| `/dashboard/[slug]/reports` | Reports |
| `/dashboard/[slug]/site` | Site editor: theme, sections, images, palette, SEO, AI, versions (owner/admin) |
| `/dashboard/[slug]/settings/*` | general, branding, booking policies, release schedules (§21), customer groups, questions, payments, billing |
| `/my/bookings` | Customer area |
| `/manage/[token]` | Guest manage booking |
| `/dev/checkout/[paymentId]` | Dev payment page (development only) |
| `/[slug]` | Public site (published site plan, §15); flow deep links redirect to `/[slug]/book` (reserved slugs: see backend `ReservedSlugs`) |
| `/[slug]/book` | Public booking flow |
| `/explore`, `/explore/[city]`, `/explore/[city]/[category]` | Marketplace search and SEO landing pages (§18) |
| `/dashboard/[slug]/offers` | Deals (owner/admin; §19) |
| `/dashboard/[slug]/settings/marketplace` | Marketplace listing (owner/admin; §18) |
| `/oauth/authorize` | OAuth consent screen for AI assistants (§20) |
| `/my/connected-apps` | Connected AI apps (view and revoke) |
| `/help/ai-assistant` | "Use bookanything in your AI assistant" |

Reserved slugs: `api, app, admin, dashboard, my, manage, onboarding, pricing,
for, legal, sign-in, sign-up, dev, embed, b, help, support, blog, about,
contact, login, logout, signup, settings, static, _next, www, mail, invitations, v1, health, explore, oauth, mcp`,
and Next.js's root metadata routes `opengraph-image, twitter-image, icon, apple-icon, manifest, robots, sitemap`.
A slug is never UUID-shaped (`GET /v1/businesses/{idOrSlug}` reads one as an id).

## 12. Industry templates (backend `templates/`)

`physio`, `car_wash`, `music_lessons`, `gp_practice`, plus `salon`,
`fitness_class`, `generic`. Each is a complete `BusinessSetup`:

- **physio**: resources Therapists (person) + Treatment rooms (space);
  services Initial assessment 60m, Follow-up 45m, Sports massage 30/60m
  options; requirement "Therapist" (selectable) + "Room"; full prepayment;
  question "What would you like help with?" (sensitive).
- **car_wash**: resources Bay 1, Bay 2 (space); services Exterior wash,
  Full valet with options Small car / Family car / SUV-Van (duration and
  price vary), add-ons Wax, Interior shampoo; question "Vehicle registration"
  (required), "Make and model"; buffer after 10m.
- **music_lessons**: resources Teachers (person) + Practice room; services
  Trial lesson 30m (free), Lesson 30/45/60m options; questions Instrument
  (select), Level (select), student's age; groups Existing students / New
  students (trial restricted to new).
- **gp_practice**: resources Doctors + Practice nurse (person); groups
  Private patient, GMS / medical card holder (`restricted`: only windows that
  list it); services GP consultation 15m, Nurse appointment 15m, Blood test
  10m, Smear test 20m; payment `at_venue` by default (clinics may switch);
  question "Reason for visit" (sensitive, optional).

## 13. Implementation notes (backend phase B1)

Clarifications made while implementing; the backend follows these.

- **Availability**: rule audiences apply to every resource's rules (a restricted
  group needs windows that list it on *all* required resources, e.g. rooms too).
  The blocked span (including buffers) must fit inside the window. Candidate
  starts step from `windowStart + bufferBefore` in real (instant) time, so DST
  days have no phantom or missing hours. `resources.capacity` is informational;
  group-session seats come from `services.capacity`.
- **Staff mode** (`GET /businesses/{id}/availability`, `POST /bookings`,
  staff reschedule): no min-notice or max-advance limits (never in the past).
  `resourceId` on the staff availability query may be a comma list. Staff
  bookings are `confirmed` directly (no approval step).
- **Next available time only** (`policies.nextAvailableOnly`, column
  `businesses.next_available_only`): customer availability (public, manage link,
  `/me` reschedule and the MCP `check_availability`) shows only the earliest free
  time in the range, with `nextAvailableOnly: true`; every other day of the range
  stays in `days` with no slots. The customer asks again with `after` = the shown
  start to see the next one. `after` (ISO-8601 with offset, as slot starts are
  returned) keeps only slots starting strictly after it, with or without the
  policy. The rule (`availability/NextAvailable`) runs last, after offers and
  every booking rule. Staff availability, booking and reschedule are not limited
  (a customer may still book any free time); marketplace cards show one next time.
- **Options**: booking a service that has options requires `optionId`;
  availability without `optionId` uses the service's base duration.
- **Customer self-service**: cancel while status is held/pending/confirmed and the
  start is in the future (refund per policy); reschedule while pending/confirmed
  and at least `cancellationNoticeHours` before the start. Reschedule keeps the
  booking's duration and resources are re-chosen unless `resourceId` is given.
  Signed-in customers get the same reschedule slots as the manage link from
  `GET /v1/me/bookings/{id}/availability` (never the public availability, which
  ignores the booking's group and counts its own allocation as busy), and resume
  payment of a held booking with `POST /v1/me/bookings/{id}/pay`.
- **Payment links for dashboard bookings**: a staff booking with
  `paymentMode: collect_online` is `held` like a public one; the create response
  and `BookingDetail.checkoutUrl` return the checkout link while the hold is
  valid, `notifyCustomer` emails it (`payment_requested`) and
  `POST /bookings/{id}/send-payment-link` emails it again.
- **Late payments**: a charge that succeeds after its hold expired re-activates
  the booking if its exact resources are still free, otherwise it is refunded in
  full and the booking is cancelled by `system`.
- **Service editing**: option/add-on/requirement items in `ServiceInput` accept an
  optional `id`; items matching an existing id (or name/label) are updated in
  place so ids referenced by bookings stay stable.
- **Staff visibility**: staff see their linked resources only in `GET /resources`,
  bookings with an allocation on their resources, and customers who have such a
  booking or no bookings yet.
- **Invitations**: pending invitations for the user's verified email are accepted
  on `/v1/me`; `Me.pendingInvitations` lists only those that could not be accepted
  (e.g. the Free plan member limit). Invitation emails link to
  `${APP_BASE_URL}/invitations/{token}` (frontend calls
  `POST /v1/invitations/{token}/accept`). Free plan: at most 3 active or invited members.
- **Reports**: revenue = amount paid − refunded, plus the price of completed
  pay-at-venue bookings, by booking start date; `availableMinutes` ignores audiences.
- **Group deletion**: groups referenced by bookings, rules or services are
  deactivated instead of deleted.
- **Webhooks**: `/v1/webhooks/stripe` and `/v1/webhooks/clerk` answer 503
  `WEBHOOKS_NOT_CONFIGURED` without their secrets; billing checkout/portal answer 409
  `PAYMENTS_NOT_CONFIGURED` without Stripe.

## 14. Implementation notes (backend phase B2)

- **Stripe Connect accounts** are created with `controller` settings equivalent to
  Standard accounts (Stripe collects requirements, the account pays Stripe fees,
  full Stripe dashboard) and onboarded with Account Links. The account id is
  stored on the first `/payments/connect`; `stripe_charges_enabled` comes from
  `account.updated` and is refreshed by `GET /payments/status`.
- **Stripe events**: verified with the SDK against `STRIPE_WEBHOOK_SECRET` and
  `STRIPE_CONNECT_WEBHOOK_SECRET` (one URL may serve both), stored in
  `provider_events` (`ON CONFLICT DO NOTHING`), and processed by the `stripe_event`
  job in one transaction that locks the event row and sets `processed_at`
  (exactly-once effects). Handled: `checkout.session.completed|async_payment_succeeded|
  async_payment_failed|expired`, `charge.refunded`, `account.updated`,
  `account.application.deauthorized`, `refund.updated|failed`, `charge.refund.updated`,
  `customer.subscription.created|updated|deleted`, `invoice.payment_failed`.
  Other types are stored and marked processed.
- **Refunds**: the booking's refunded total is recomputed from succeeded refund
  rows. If the provider is unreachable the cancellation still commits, the refund
  row stays `pending` and a `payment_refund_retry` job retries it with the same
  idempotency key, then emails `payment_refunded`; a refund that fails for good
  is handled as in §7 ("Refunds", steps 4-5). `charge.refunded` settles pending
  rows and records refunds made in the Stripe dashboard (from a total reported
  before a refund failed, the failed one's amount is taken off first).
- **Plans from subscriptions**: `active`/`trialing` → plan of the price
  (`STRIPE_PRICE_*`, falling back to `metadata.plan`); `past_due` keeps the plan
  (dunning); `incomplete` never upgrades; `canceled`/`incomplete_expired`/`unpaid`/
  `paused`/deleted → `free`. Events for an older subscription never override the
  current one. `invoice.payment_failed` sets `plan_status=past_due`.
- **Emails**: the cancellation and declined emails state the refund (or that it
  is being processed, that the business will arrange it when it failed, or that
  no refund applies); a separate `payment_refunded` email is sent only for
  refunds outside those flows, and `payment_refund_failed` when a refund the
  customer was told about fails.
  From is `"<Business name>" <EMAIL_FROM address>` with Reply-To the business
  contact email (business notifications reply to the customer).
- **Clerk webhook**: `user.created|updated` upsert the user; `user.deleted`
  anonymises it (email/name cleared, `deleted_at`), unlinks `customers.user_id`,
  sets memberships `removed`, and suspends a business whose last owner was
  deleted. Events are stored in `provider_events` as `clerk:<svix-id>`.
- **Content negotiation** is installed on the routing root (not the application) so
  `/v1/mcp` can use the MCP SDK's JSON settings; error bodies are serialized
  explicitly and are identical everywhere.
- **Rate-limit client IP**: `TRUST_FORWARDED_FOR` reads `X-Forwarded-For` right
  to left and uses the first hop that is not a trusted proxy (or the entry for
  `TRUSTED_PROXY_HOPS`); the header is ignored when the TCP peer is not trusted.
  IPv6 clients are bucketed by /64.
- **Website fetch (SSRF)**: http(s) on ports 80/443 only; hosts made of digits and
  dots must be plain dotted quads (OkHttp connects to them without DNS and Java
  reads `127.1` or `2130706433` as loopback); every resolved and actually
  connected address, on every redirect hop, must be public (IPv4-mapped, NAT64
  and 6to4 addresses are judged by their embedded IPv4 address).
- **Production config**: `CLERK_AUTHORIZED_PARTIES` is required so the `azp`
  claim is always checked.


## 15. Sites: themes, section blocks and the AI site builder

> **Off by default.** We sell booking, not websites. With `SITES_ENABLED` unset (or `false`, the production
> setting) the public business carries no `site`, `/[slug]` redirects to the booking portal at `/[slug]/book`, the
> site routes (`/v1/businesses/{id}/site…`) answer 404, Bo has no "publish your site" nudge, the demo seed publishes
> no sites, and the dashboard hides the site builder (`Business.sitesEnabled` tells it). The booking portal's look is
> `branding.portalStyle`, one of the six theme keys (default: the industry's pick, `SiteThemes.choose`), with the brand
> colour; owners choose it in Settings → Branding and in onboarding's "Look" step. Deals the site used to show above
> the fold appear in the portal's intro instead. Everything below describes the feature with the switch on.

Every business gets a public **site** at `/[slug]` in front of the booking flow. The AI never
writes HTML, CSS or JavaScript: it fills a typed, schema-validated **site plan** (JSON) and our
design system renders it. Owners edit the same plan by hand in the dashboard.

### 15.1 Information architecture

- `/[slug]` renders the published site (hero, services, team, …) with a persistent **Book**
  button. `/[slug]/book` is the existing booking flow, themed like the site.
- Booking deep links keep working: `/[slug]?service=…` (or any other flow parameter: `group`,
  `option`, `addons`, `with`, `date`, `time`, `step`) redirects to `/[slug]/book?…`. Service cards
  link to `/[slug]/book?service=<id>`.
- A business without a published plan gets a **default plan** derived from its industry,
  services, team, hours and policies (the same deterministic generator used when no AI key is
  configured), so every business has a good-looking site from day one.
- `?site=draft` on `/[slug]` renders the draft plan for signed-in owners/admins (preview in a new tab).

### 15.2 Data model

```
business_sites(business_id PK → businesses, draft JSONB, draft_version INT,
  published JSONB NULL, published_version INT NULL, published_at NULL,
  updated_at, updated_by_user_id NULL)
site_versions(id, business_id, version INT, plan JSONB,
  source TEXT ('owner'|'ai_generate'|'ai_edit'|'restore'|'template'|'seed'),
  instruction TEXT NULL, changes JSONB (string[]), actor_type actor_type, actor_user_id NULL,
  created_at, UNIQUE(business_id, version))
```

Both are tenant tables with RLS like the others. AI usage is metered in the shared ledger (`ai_usage`, §16). Every draft change is a new version
(`version` increases by one per business). The newest 50 versions are kept, plus the published one.

### 15.3 Site plan

```ts
type SiteThemeKey = "clinical" | "calm" | "bold" | "playful" | "editorial" | "minimal";
type SiteSectionType = "hero" | "services" | "team" | "about" | "gallery" | "testimonials" | "faq" | "hours" | "cta" | "contact";
type GeneratedPattern = "aurora" | "mesh" | "waves" | "grid" | "dots" | "rays";

type SiteImage = {
  kind: "upload" | "stock" | "generated";
  url: string | null;          // upload: our storage URL for THIS business; stock: https://images.unsplash.com/…; generated: null
  alt: string;                 // ≤ 140
  pattern: GeneratedPattern | null;                 // generated only (drawn from the palette, no external asset)
  attribution: { name: string; url: string } | null; // stock only (required): photographer + https://unsplash.com/… profile link
};

type SitePlan = {
  theme: SiteThemeKey;
  palette: { primaryColor: string /* #rrggbb */; accent: string | null };
  seo: { title: string | null /* ≤ 70 */; description: string | null /* ≤ 160 */ };
  sections: SiteSection[];     // ≤ 16, at most one hero; order = page order
};
type SiteSection = { id: string /* ^[a-z0-9-]{1,40}$, unique */; type: SiteSectionType; enabled: boolean; content: SectionContent };

// content by type (limits in characters; text is plain, "\n\n" separates paragraphs)
type HeroContent = { variant: "split" | "cover" | "minimal"; eyebrow: string | null /* 60 */; headline: string /* 1..90 */;
  subheadline: string | null /* 240 */; ctaLabel: string | null /* 30, default "Book now" */; image: SiteImage | null };
type ServicesContent = { heading: string /* 80 */; intro: string | null /* 300 */;
  serviceIds: string[] /* real service ids, [] = all public services */; showPrices: boolean; showDurations: boolean };
type TeamContent = { heading: string; intro: string | null;
  members: { resourceId: string /* a real person resource */; bio: string | null /* 400 */; photo: SiteImage | null }[] /* ≤ 24, [] = all people */ };
type AboutContent = { heading: string; body: string /* 1..1500 */; highlights: string[] /* ≤ 4 × 60 */; image: SiteImage | null };
type GalleryContent = { heading: string | null; images: SiteImage[] /* ≤ 12 */ };
type TestimonialsContent = { heading: string; items: { quote: string /* 400 */; author: string /* 60 */; detail: string | null /* 60 */ }[] /* ≤ 8 */ };
type FaqContent = { heading: string; items: { question: string /* 140 */; answer: string /* 600 */ }[] /* ≤ 12 */ };
type HoursContent = { heading: string; note: string | null /* 200 */; showAddress: boolean; showMapLink: boolean };
type CtaContent = { headline: string /* 90 */; body: string | null /* 240 */; buttonLabel: string /* 30 */ };
type ContactContent = { heading: string; body: string | null /* 300 */; showPhone: boolean; showEmail: boolean; showAddress: boolean };
```

Rendering pulls **live data**, never copy: services (names, prices, durations) come from the
public services, team members from active `person` resources, hours from the weekly rules and
the address from the business. Sections that reference missing services or resources simply skip
them; sections with nothing to show are hidden on the public page (the editor shows an empty state).

### 15.4 Validation (server-side, identical for owner input and AI output)

- Strict decoding: unknown themes, section types, variants, patterns **and unknown fields**
  (e.g. `rating`, `price`, `award`) are `400 INVALID_REQUEST` with the field path
  (`sections[2].content.rating`).
- Text: trimmed, control characters rejected, length limits above; required fields non-empty.
- Images: `upload` URLs must start with this business's storage prefix (tenant-scoped);
  `stock` URLs must be `https://images.unsplash.com/…` with an attribution whose URL starts
  `https://unsplash.com/`; `generated` has a pattern and no URL.
- `serviceIds` must be services of this business; `members[].resourceId` active person resources of this business.
- Palette contrast (port of `frontend/src/lib/theme/color.ts`): `primaryColor` needs ≥ 3:1 against
  white (buttons and links on a light page) and a readable foreground (white or ink `#1c1917`) at
  ≥ 4.5:1; `accent` needs ≥ 3:1 against white. Dark-mode variants are derived by the frontend.
- ≤ 16 sections, ≤ 1 hero, unique section ids.
- AI output additionally: testimonial items are always dropped (testimonials only come from the
  owner; the AI may add an empty, disabled testimonials section), sentences with prices, money
  amounts, guarantees, cure/medical claims, awards, ratings or credentials are removed
  (`CopyGuard`), and the plan is then validated like owner input. Invalid output falls back (§15.6).

### 15.5 API (prefix `/v1/businesses/{businessId}`, auth A = owner/admin)

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/site` | A | `SiteState` (draft = default plan with `draftVersion: null` when never saved) |
| PUT | `/site` | A | `{plan: SitePlan, baseVersion?: number}` → `SiteState`; new version (`source:"owner"`) unless unchanged; 409 `CONFLICT` when `baseVersion` is stale |
| POST | `/site/publish` | A | → `SiteState`; published = draft; also sets `branding.primaryColor` to the palette's primary colour |
| GET | `/site/versions` | A | → `{items: SiteVersion[]}` (newest first) |
| GET | `/site/versions/{version}` | A | → `SiteVersion & {plan: SitePlan}` |
| POST | `/site/versions/{version}/restore` | A | → `SiteState` (copies that plan into a new draft version, `source:"restore"`; stale references dropped) |
| POST | `/site/generate` | A | `{prompt?: string /* ≤ 2000 */, websiteUrl?: string}` → `SiteAiResult` |
| POST | `/site/edit` | A | `{instruction: string /* 1..500 */, baseVersion?: number}` → `SiteAiResult` |
| GET | `/site/stock` | A | `q, page?` → `{enabled: boolean, results: StockPhoto[]}` (Unsplash search; `enabled:false` without a key) |
| POST | `/site/stock/download` | A | `{downloadLocation}` → 204 (Unsplash download tracking when a photo is chosen) |
| POST | `/uploads` | A | multipart `file` → 201 `Upload` |
| GET | `/v1/public/uploads/{businessId}/{file}` | P | the image (local disk storage only) |

`GET /v1/public/businesses/{slug}` includes `site: PublicSite` (the published plan, or the default
plan with `isDefault: true`). Other embeddings of `PublicBusiness` (manage page, MCP) omit it (`null`).

```ts
type SiteContext = {
  team: { id: string; name: string; description: string | null }[];               // active person resources
  openingHours: { dayOfWeek: number; intervals: { start: string; end: string }[] }[]; // Mon..Sun, union of active resources' rules valid today
};
type PublicSite = { plan: SitePlan; isDefault: boolean; context: SiteContext };
type SiteState = {
  draft: SitePlan; draftVersion: number | null; published: SitePlan | null; publishedVersion: number | null;
  publishedAt: string | null; updatedAt: string | null; hasUnpublishedChanges: boolean; context: SiteContext;
  ai: { model: boolean /* a model is configured */; credits: AiCredits /* §16 */ };
  stock: { enabled: boolean }; uploads: { enabled: boolean; maxBytes: number };
};
type SiteVersion = { version: number; source: "owner" | "ai_generate" | "ai_edit" | "restore" | "template" | "seed";
  instruction: string | null; changes: string[]; actorType: string; actorName: string | null;
  createdAt: string; isPublished: boolean; isDraft: boolean };
type SiteAiResult = { state: SiteState; source: "ai" | "template"; changes: string[]; previousVersion: number | null; message: string | null };
type StockPhoto = { id: string; url: string; thumbUrl: string; width: number; height: number; color: string | null;
  alt: string; attribution: { name: string; url: string }; downloadLocation: string };
type Upload = { url: string; contentType: "image/png" | "image/jpeg" | "image/webp"; bytes: number; width: number; height: number };
```

Commands are audited: `site.updated`, `site.published`, `site.restored` (actor owner/member),
`site.generated`, `site.edited` (actor `ai`, the copilot acting for the requesting user, with the
instruction and change list in the summary), `upload.created`.

### 15.6 AI generation and conversational edits

- Same Anthropic client and model settings as §9 (`ANTHROPIC_MODEL`, default `claude-opus-5-5`,
  structured outputs via JSON schema, effort medium, refusal / `max_tokens` handling). The
  website is fetched with the SSRF-safe `WebsiteFetcher` and marked as untrusted.
- Context: business name, industry, description, city, services (id, name, description,
  duration, category), team (id, name, description), vocabulary, cancellation policy, opening
  hours, the owner's prompt/instruction, optional website text and (edits) the current plan.
  Never form questions, answers or any customer data.
- The model picks the theme, sections, order and copy (headlines, about, FAQ, SEO) and suggests a
  palette. It never writes image URLs or testimonials; images carry over from the current plan by
  section id or use generated patterns.
- **Generate** replaces the draft with a new version (`source:"ai_generate"`). **Edit** sends the
  current draft plus the instruction and gets a full revised plan (`source:"ai_edit"`). Both return
  a human change list (e.g. "Theme: Calm → Bold", "Added section: FAQ", "Moved Testimonials up")
  that the editor shows with **Keep** or **Undo** (undo = restore `previousVersion`).
- Without `ANTHROPIC_API_KEY`, or on refusal/error/invalid output: **generate** uses the
  deterministic template generator (industry → theme, safe copy from real data, FAQ from the real
  policies, `source:"template"`); **edit** uses a small rule-based interpreter (theme and mood
  words, "move X higher/lower", "hide/show X", "add a FAQ about Y", headline changes). An edit
  that changes nothing creates no version and is not metered (`message` explains).
- With a model, generation and edits spend the business's **AI credits** (§16; there are no per-feature caps, only
  the one allowance). Credits are checked before the model is called: used up → 409 `AI_LIMIT_REACHED`. The model
  call is metered even when its output is refused and the built-in designer answers. The built-in designer itself (no
  model) is free and unlimited. Plus a per-IP rate limit (60/hour).

### 15.7 Images and storage

- `AssetStorage`: **S3-compatible** when `STORAGE_S3_BUCKET` (+ keys, `STORAGE_PUBLIC_BASE_URL`) is
  set (SigV4 over OkHttp; path-style when `STORAGE_S3_ENDPOINT` is set, e.g. R2/MinIO); else
  **local disk** at `STORAGE_LOCAL_DIR` (development default `.data/uploads`), served by
  `GET /v1/public/uploads/…` and addressed as `${APP_BASE_URL}/api/v1/public/uploads/{businessId}/{file}`;
  else **off** (503 `UPLOADS_NOT_CONFIGURED`). Keys are `businesses/{businessId}/{uuid}.{ext}`.
- Uploads: PNG, JPEG or WebP detected from the bytes (not the declared type), ≤ 5 MB, ≤ 6000 px per
  side (read from the header before decoding), metadata stripped (JPEG APPn except JFIF/ICC, PNG
  text/time/EXIF chunks, WebP EXIF/XMP chunks), served with `Cache-Control: immutable` and `nosniff`.
- Stock photos: Unsplash search behind `UNSPLASH_ACCESS_KEY` (hotlinked `images.unsplash.com`
  URLs, attribution "Photo by X on Unsplash" rendered next to the image, download tracked on use).
  Without it the picker offers generated backgrounds drawn from the palette.
- Branding logo and cover can use uploads too.

### 15.8 Themes (frontend)

Six themes are sets of design-token overrides applied with `data-theme` on the public page only
(`/[slug]` and `/[slug]/book`): heading/body font pairing from a self-hosted allowlist (font files committed to the repository,
so a build never downloads them), radius scale, surfaces and background treatment, header style, image treatment, button shape and section
spacing, each in light and dark. The business colour is layered on top with computed contrast
against the theme's own surfaces. Section blocks use container queries, so the dashboard preview
renders the real mobile and desktop layouts at any size.

## 16. AI usage metering and credits

Every model call, by every feature, is metered in one ledger and limited by one monthly allowance.

### 16.1 The seam

```
feature (business draft, site generator, Bo) ──► AiModel = MeteredAiModel ──► ModelClient (Anthropic | scripted fake)
                                                   │ reserve → call → settle
                                                   ▼
                                                 ai_usage (ledger)
```

`AiModel` (`ai/AiModel.kt`) is the only interface features receive, and its only production implementation is the
metering decorator `MeteredAiModel` around the raw `ModelClient`. Each call names an `AiCaller(feature, businessId,
userId, requestId)`. Before the call a **reservation** row is written (a per-feature estimate of the model cost, in
micro-cents); the call runs; the row is **settled** with the provider's input, cache-write, cache-read and output tokens, the
stop reason and message id. A call that fails before the provider counted anything is released; a stream that broke
part-way is settled with what was already counted.

```
ai_usage(id, business_id NULL (only the onboarding draft), user_id NULL, feature ('business_draft'|'site_generate'|
  'site_edit'|'assistant'), model, status ('reserved'|'settled'|'released'), input_tokens, cache_write_tokens,
  cache_read_tokens, output_tokens, reserved_micro_cents, cost_micro_cents, overage_micro_cents, price_version,
  request_id, provider_message_id, stop_reason, created_at, settled_at, overage_reported_at)
```

Tenant table with RLS (rows without a business are only visible to platform-level work).

### 16.2 Prices and credits

- **Price table** (`resources/ai/prices.json`, or `AI_PRICES_FILE`): append-only versions, each with an
  `effectiveFrom` and per-model list prices in US dollars per million tokens (input, 5-minute cache write, cache read,
  output) plus a fallback model (the most expensive, so unknown models are never undercharged). The version in force at
  the call is recorded on the row. Claude Opus 5.5: $4 / $5 / $0.20 / $20.
- **Cost** is exact decimal arithmetic in micro-cents (10⁻⁶ US cent), rounded half up.
- **Credits** are derived from cost: what one credit is worth is configuration (`AI_CREDIT_MICRO_CENTS`, model
  list-price cost per credit in micro-cents, in the provider's currency so credits never drift with exchange rates).
- **Monthly credits per plan** are configuration too (`AI_CREDITS_FREE`, `AI_CREDITS_PRO`, `AI_CREDITS_BUSINESS`),
  counted per calendar month in the business timezone. The code's defaults are development placeholders; production
  with a model refuses to start unless all four settings are set.

### 16.3 Enforcement

- A call may **start** while less than the allowance is **committed** (settled cost this period plus reservations of
  calls in flight; reservations older than 15 minutes belong to crashed requests and stop counting, and a periodic job
  releases them). Checks and settlements serialise per business with an advisory lock, so concurrent calls cannot all
  slip through; a month overshoots by at most one call.
- Refused → 409 `AI_LIMIT_REACHED` naming the plan, the allowance, the upgrade and the reset date. Features check up
  front (site builder before generating, Bo before streaming) and the decorator enforces again at reservation.
- **Overage** (optional): with `AI_OVERAGE_METER_EVENT` and Stripe configured, paid-plan businesses with a Stripe
  customer keep working past their credits, up to `AI_OVERAGE_MAX_CREDITS` extra a month. The part of each call past the
  allowance is stored as `overage_micro_cents` and reported by the `ai_overage_report` job as a Stripe Billing Meter
  event (`identifier` = the usage id, so retries are idempotent). The meter counts hundredths of a credit: price the
  metered price per 100 units. Without it the allowance is a hard limit.

### 16.4 API and UI

`GET /v1/businesses/{id}/ai/usage` (owner/admin) → `AiUsage`. Every AI surface shows the credits (`AiCredits` is
embedded in `SiteState.ai` and the assistant state) with an inline "running low" notice at a fifth left. Settings →
Billing has the meter, the per-feature breakdown and a daily chart with a table view.

```ts
type AiCredits = { limit: number; used: number; remaining: number; runningLow: boolean; limitReached: boolean;
  resetsOn: string; overage: boolean };   // credits, two decimals
type AiUsage = { plan: "free" | "pro" | "business"; timezone: string; periodStart: string; periodEnd: string;
  credits: AiCredits; model: { configured: boolean; name: string | null };
  byFeature: { feature: AiFeature; label: string; credits: number; requests: number }[];
  daily: { date: string; credits: number }[] };
```

## 17. Bo, the business assistant

> **Off by default.** We don't offer Bo for now: owners who want AI connect their own assistant (Claude, ChatGPT and
> others) to the business MCP (§20.7; help page `/help/ai-agents-for-business`), which is on either way. With
> `ASSISTANT_ENABLED` unset (or `false`, every environment's default) the `/v1/businesses/{id}/assistant…` routes are not
> mounted (404), the nudges task doesn't run and nothing is metered as `assistant`. The tool registry, the proposals
> (`assistant_actions`) and `/agent-requests` stay, since the business MCP serves the same tools. `Business.assistantAvailable`
> (on and a model configured) tells the dashboard and the app whether to show Bo; the public pages follow
> `NEXT_PUBLIC_ASSISTANT_ENABLED` at build time. Everything below describes Bo switched on; kept behind the switch rather
> than deleted.

Bo is a persistent assistant for owners, admins and staff, in the dashboard only: a floating character (bottom-left;
⌘J, or ⌘K "Ask Bo…") opening a side sheet (a drawer on phones) with nudges, quick actions, recent conversations, the
chat and the business memory. The name is a single constant on each side (`ASSISTANT_NAME`).

### 17.1 Conversations

```
assistant_threads(id, business_id, user_id, title, context_hash, busy_until, created_at, updated_at)
assistant_messages(id, business_id, thread_id, seq, role ('user'|'assistant'),
  kind ('message'|'tool_results'|'event'|'refusal'|'truncated'|'error'), content JSONB, created_at)
assistant_actions(id, business_id, thread_id, user_id, tool, tool_use_id, input JSONB, preview JSONB,
  status ('pending'|'confirmed'|'rejected'|'expired'|'failed'), result JSONB, error, expires_at, created_at, decided_at)
assistant_memory(id, business_id, text (≤ 280), created_by_user_id, created_at, updated_at)
assistant_nudges(id, business_id, key, kind, payload JSONB, created_at, refreshed_at, resolved_at, dismissed_at,
  UNIQUE(business_id, key))
```

All tenant tables with RLS. Threads are private to the member who started them (others: 404).

- Messages store the exact content blocks sent to or received from the model (text, thinking with its signature,
  tool use, tool results), so history replays byte-identically. `refusal`, `truncated` and `error` messages are notices
  for people only; `event` messages tell the model what happened to a proposal (`<action_update …>`).
- A **turn** (`POST …/threads/{id}/messages`, streamed as SSE): store the user's turn → call the model (streaming its
  text) → run the tools it asked for, returning **all** results of one reply in a single user message → repeat until it
  answers, refuses, runs out of room (`max_tokens`: no tools run, the turn ends with a notice) or 6 model calls were
  used. `busy_until` stops two turns interleaving in one thread. Each model call is metered (feature `assistant`).
- Without a model: `GET /assistant` still works (nudges, quick actions, honest "AI isn't configured" state) and sending
  answers 503 `AI_NOT_CONFIGURED`. There are no fake answers.

### 17.2 Prompt and caching

- **System prompt**: a constant (who Bo is, how it works, safety, out of scope). **Tools**: strict JSON schemas,
  sorted by name, chosen only by role. Tools render before the system prompt, which carries an explicit cache
  breakpoint; automatic caching covers the conversation tail. Nothing per-request is in the prefix.
- **Per turn**, in the user's message: `<business_context>` (business, vocabulary, the person and their role, staff
  scope, the business memory as data) only when it changed (hashed per thread) or the history's start moved, then
  `<turn_context>Today: … Time now: …</turn_context>`, then the user's words last.
- Model settings: `ANTHROPIC_MODEL` (Claude Opus 5.5), thinking at the model default (never disabled), effort
  `ASSISTANT_EFFORT` (default low), `tool_choice: auto` (forced tool choice is a 400 on this model), no prefill,
  8,000 max tokens.
- **History** only grows at the end, so each request replays the previous one exactly (prompt cache, and thinking
  blocks, which are only valid behind the history they were made with): action updates join the next user message
  rather than where they were stored, and tool results lead a merged user message. Past 60 messages before the
  current turn, older turns are left out in steps of 30 (`AssistantPrompt.window`, chosen from message heads so only
  the window is loaded); replies made before the start last moved go back without their thinking.

### 17.3 Tools

A registry (`assistant/tools`): each tool is one registration with a name, a description saying when to call it, a
strict schema, a typed input (decoded strictly, unknown fields refused), a minimum role and a handler that calls the
**same commands as the dashboard** (`StaffBookingCommands`, `AvailabilityCommands`, `ServiceCommands`, `BusinessOverview`,
`ReportRepository`, `MemoryCommands`), never SQL of its own. Tools run as the signed-in member: staff only see and change
their own resources (and tools above their role are neither offered nor run).

| Read (staff unless noted) | Write: proposal first |
|---|---|
| `get_schedule`, `find_bookings`, `find_customers`, `check_availability`, `business_overview`, `list_services`, `list_resources`, `get_policies`, `get_stats` (admin) | `create_booking`, `reschedule_booking`, `cancel_bookings` (bulk, refund per booking), `send_payment_link`, `block_time`, `close_date` (admin), `update_opening_hours`, `update_service` (admin), `update_memory` (admin) |

**Write tools never execute in the turn.** They validate and return a **proposal** (title, summary, before/after
changes, every affected item of a bulk change, warnings), stored as a pending action. The chat shows it as a card;
`POST …/actions/{id}/confirm` (only by the member who asked, within 30 minutes) runs the command in one transaction with
the action locked, audited with actor `ai` (and `assistant.action_confirmed`); confirming again returns the stored
result. A business-rule failure at that point (a slot taken meanwhile) marks it `failed`.

Deals (§19) apply to Bo's bookings exactly as to the dashboard's: `create_booking` executes through `BookingEngine.create`,
so the confirmed booking gets the best offer and its price snapshot. The proposal card previews that price
(`OfferPricing.preview`, which reserves nothing), `check_availability` and the booking views name the deal, and a
reschedule keeps the price (staff rules: any time).

### 17.4 Safety

- Tool results, customer names, notes and answers and the memory are data, never instructions: results with
  customer-entered text carry an explicit "untrusted data" note, and the system prompt says so. Even an obedient model
  can only *propose*; nothing changes without the member's confirmation.
- Sensitive form answers are never included in tool results; form questions are not exposed.
- Out-of-scope requests (billing, payouts, deleting the business, team roles, bulk marketing, professional advice) are
  declined; `refusal` stop reasons end the turn with a notice and nothing is run.

### 17.5 Nudges

Deterministic checks (no model calls), one registration each (`NudgeRules.ALL`), for owners and admins: bookings
waiting for approval, a no-show streak on services without deposits, a quiet tomorrow (< 30% booked), online payments
not set up, the site not published, AI credits running low. Re-evaluated when the assistant opens (at most every five
minutes per business) and every 15 minutes for businesses active in the last 14 days (anything audited or a booking
created); each has a fingerprinted key so a dismissed nudge returns when the facts change. A nudge has a link and a
prompt that starts a conversation about it. The launcher shows a badge with the count.

### 17.6 Development and tests

`AI_FAKE_SCRIPT` (development only; refused when `APP_ENV=production`) selects a scripted fake model: rules matched
against the user's words, one reply per step, with placeholders resolved from the latest tool results (`demo` is
bundled: book someone in, what's on this week, use lots of credits). Tests drive the real tool loop with inline scripts.

## 18. Marketplace (`/explore`)

People find and book businesses across bookanything at `/explore`. Businesses opt in; listing is a **Pro and
Business** feature and, like everything else, **commission-free** (0% platform fee).

### 18.1 Data

```
business_locations(business_id PK → businesses, latitude NULL, longitude NULL, address_key, precision ENUM-ish
  ('address'|'postcode'|'city'|'none'), source ('mapbox'|'table'), geocoded_at)       -- 'none' = could not be located
marketplace_listings(business_id PK → businesses, category, listed_at, updated_at)
```

Both are tenant tables with RLS; kept separate from `businesses`. `(latitude, longitude)` has a btree index used as the
bounding-box prefilter.

### 18.2 Geocoding

- `Geocoder` interface (`geo/`): `MapboxGeocoder` (Mapbox Geocoding API v6, `permanent=true` because we store results; Mapbox's
  terms only allow storing permanent geocodes) when `MAPBOX_ACCESS_TOKEN` is set, with `TableGeocoder` as the fallback; otherwise
  `TableGeocoder` alone. `TableGeocoder` is deterministic, no network: the fictional demo addresses, Eircode routing keys (first
  three characters) and a built-in list of Irish cities and towns (`IrishPlaces`, also the city picker).
- Geocoding runs on the job queue (`geocode_business`): enqueued in the same transaction as an address change (`PATCH` business)
  or when a business lists itself without a location. The worker calls the geocoder outside any transaction and stores the
  result keyed by the normalised address (`address_key`), so an unchanged address is never geocoded twice. Network errors retry
  with backoff; "not found" is stored as precision `none`.

### 18.3 Categories

A controlled taxonomy (`MarketplaceCategories`): `physio`, `gp-practice`, `dental`, `salon`, `barber`, `massage`, `fitness`,
`music-lessons`, `tutoring`, `car-wash`, `pet-grooming`, `other`. Each has a label, plural, the industries (template keys) that
default to it and search keywords ("valet" finds car washes). Adding a category is one entry; the frontend reads the list from
`/v1/public/marketplace/meta` and falls back to a generic icon for unknown keys.

### 18.4 API

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/v1/public/marketplace/meta` | P | `{categories: MarketplaceCategory[], cities: MarketplaceCity[]}` (cities with visible listings within 20 km) |
| GET | `/v1/public/marketplace/search` | P | `q, category, city \| lat+lng, radiusKm, available=today\|week, date, minPrice, maxPrice, deals, limit (≤30), cursor` → `{items: Listing[], nextCursor, center}` |
| GET/PUT | `/v1/businesses/{id}/marketplace` | A | `MarketplaceSettings` / `{listed, category?}` (409 `PLAN_LIMIT_REACHED` on Free) |

Search: only `active` businesses on a paid plan with a listing (a downgrade to Free hides it). SQL applies text (name,
description, city, service names, category keywords), category, bounding box + exact haversine radius, price ("from" price of
a public service: its cheapest option) and deals, in keyset order: by distance (then id) near a point, else by name. The
availability filter needs the booking engine, so candidates are checked in order until the page is full or 60 candidates were
examined (the cursor continues from the last one examined). Each card gets up to three next free times (one for a business that
offers only its next available time; at most four services,
the next 7 days or the filter's window, cheapest option, deal flags), cached per business for 30 seconds (keyed by the offers
too), and its current deals. The candidates still needed for the page are checked together: their businesses, services,
offers and next times are loaded in a fixed number of queries for the group (about 12 per page), never per card. Rating is
always `null` until there are real reviews. Rate limit: 120 searches per minute per IP.

```ts
type Listing = {
  business: { id: string; slug: string; name: string; description: string | null; timezone: string; address: Address;
    branding: Branding; location: { latitude: number; longitude: number } | null };
  category: MarketplaceCategory; distanceKm: number | null; rating: null; priceFromCents: number | null; currency: string;
  nextSlots: { start: string; serviceId: string; serviceName: string; optionId: string | null; optionName: string | null;
    priceCents: number; offer: SlotOffer | null }[];
  deals: PublicOffer[];
};
type MarketplaceSettings = { listed: boolean; category: string; eligible: boolean;
  location: { latitude: number; longitude: number; precision: string; source: string; geocodedAt: string } | null;
  locationStatus: "located" | "pending" | "not_found" | "missing_address"; categories: MarketplaceCategory[] };
```

### 18.5 Frontend

`/explore` (search, category chips, city picker, "near me" via browser geolocation, availability/price/deals filters, results
with load more; filters live in the URL), SEO pages `/explore/[city]` and `/explore/[city]/[category]` (validated against the
meta, `generateMetadata`), cards linking to `/[slug]`. No map dependency: `ExploreMap` is a component seam for one later.
Entry points: marketing navigation and landing page, "Book something new" on My bookings. Owners manage the listing in
`/dashboard/[slug]/settings/marketplace` (Free sees an upgrade prompt).

## 19. Deals (off-peak and last-minute offers)

### 19.1 Data

```
offers(id, business_id, name, description, discount_type ('percent'|'fixed'), discount_value, days_of_week SMALLINT[],
  time_windows JSONB [{start,end}], last_minute_hours NULL, valid_from NULL, valid_until NULL, max_redemptions NULL,
  status ('active'|'paused'), created_at, updated_at)
offer_services(business_id, offer_id, service_id)
bookings + offer_id NULL (FK, SET NULL on delete), original_price_cents NULL, offer_snapshot JSONB NULL
```

### 19.2 Rules (pure: `OfferMatcher`)

- An offer covers a slot when it is active, covers the service, and every set condition holds, evaluated in the business
  timezone (DST-safe): the local date is within `valid_from..valid_until` (inclusive); the local day is in `days_of_week`
  (empty = every day); the local start time is inside one of the `time_windows` (`[start, end)`, empty = all day); and, when
  `last_minute_hours` is set, the slot starts after now and within that many hours.
- Discount: percent (1..100, half-up to the cent) or fixed cents, never more than the price. It applies to the whole booking
  price (option and add-ons included).
- **One offer per booking**, the best for the customer: the largest discount; ties go to the older offer, then the lower id.
  Offers that would take nothing off never apply. Redemptions = bookings holding the offer that are not cancelled or expired;
  a capped offer is locked (`FOR UPDATE`) and re-counted inside the booking transaction. The public booking flow sends the
  total it showed (`CreatePublicBooking.expectedTotalCents`); when the booking would now cost anything else (the deal's
  last redemption went meanwhile), it is refused with 409 `PRICE_CHANGED` (the new price in the message) instead of being
  made at the full price, and the flow refreshes the times and deals so the review step shows the new price.

### 19.3 Where it applies

- `BookingEngine.create` (every source: public, dashboard, API, MCP) prices the booking with the best offer:
  `price_cents` is the discounted price, `original_price_cents` and `offer_snapshot`
  (`{id, name, label, originalPriceCents, discountCents}`) record it. Online payment (`full` or `deposit` =
  `min(deposit, discounted price)`), refunds (of what was paid) and reports therefore use the discounted amount.
- Public and staff availability flag discounted slots: `Slot.offer = {id, name, label, originalPriceCents, priceCents}` for the
  requested option and add-ons (`OfferPricing.slotOffers`). `CustomerBooking`, `ManagedBooking`, `Booking` and `BookingDetail` carry `originalPriceCents` and `offer`.
- Rescheduling keeps the price. Customers (manage link, My bookings, MCP) may only move a discounted booking to a time the same
  offer's schedule covers (its reschedule availability is filtered; otherwise 409 `POLICY_VIOLATION`); staff can move it anywhere.

### 19.4 API

| Method | Path | Auth | → |
|---|---|---|---|
| GET | `/v1/public/businesses/{slug}/offers` | P | `PublicOffer[]` (active, not ended, not sold out) |
| GET/POST | `/v1/businesses/{id}/offers` | A | `Offer[]` / `OfferInput` → 201 `Offer` |
| PUT/DELETE | `/offers/{offerId}` | A | `OfferInput` → `Offer` / 204 (bookings keep their snapshot) |
| POST | `/offers/{offerId}/pause`, `/resume` | A | → `Offer` |
| POST | `/offers/preview` | A | `{offer: OfferInput, from?, days? (1..14, default 7)}` → `OfferPreview` (public slots of its services, base price, that it would discount) |

```ts
type Discount = { type: "percent"; percent: number } | { type: "fixed"; amountCents: number };
type OfferSchedule = { daysOfWeek: number[]; timeWindows: { start: string; end: string }[]; lastMinuteHours: number | null };
type OfferInput = { name: string; description: string | null; serviceIds: string[]; discount: Discount; schedule: OfferSchedule;
  validFrom: string | null; validUntil: string | null; maxRedemptions: number | null; active: boolean };
type Offer = Omit<OfferInput, "active"> & { id: string; status: "active" | "paused"; kind: "off_peak" | "last_minute" | "always";
  label: string /* "20% off" */; summary: string /* "Tue, 13:00–17:00" */; redemptions: number; createdAt: string; updatedAt: string };
type PublicOffer = { id: string; name: string; description: string | null; kind: Offer["kind"]; discount: Discount; label: string;
  summary: string; serviceIds: string[]; validUntil: string | null };
type SlotOffer = { id: string; name: string; label: string; originalPriceCents: number; priceCents: number };
```

Audited: `offer.created`, `offer.updated`, `offer.paused`, `offer.resumed`, `offer.deleted`; `booking.created` records the offer
name and discount. Frontend: dashboard "Offers" (list, create/edit with a live affected-times preview, pause/resume, redemptions),
discounted slots highlighted with the original price struck through in the booking flow, deals on `/[slug]` and on `/explore`.

## 20. Signed-in MCP servers and our OAuth 2.1 authorization server

Customers add bookanything to their own AI assistant (Claude, ChatGPT and other clients with remote MCP + OAuth) and it acts
as them. Customer-facing guide: `/help/ai-assistant`. Business members do the same with the business server (§20.7):
`/help/ai-agents-for-business`. One authorization server serves both resources; a token is for exactly one of them.

### 20.1 Spec revisions implemented

- **Authorization: MCP specification 2026-07-28** (latest; "Authorization", "Authorization Server Discovery", "Client
  Registration" and "Security Considerations"). We implement: RFC 9728 protected resource metadata (both the `WWW-Authenticate`
  `resource_metadata` pointer and the well-known URIs), RFC 8414 authorization server metadata, OAuth 2.1 authorization code
  with PKCE (S256 only; `code_challenge_methods_supported` advertised), **Client ID Metadata Documents** (preferred by the spec,
  `client_id_metadata_document_supported: true`) and **Dynamic Client Registration** (deprecated in 2026-07-28 but still used
  by current clients, kept for compatibility), RFC 8707 resource indicators with audience-bound tokens, RFC 9207 `iss` in
  authorization responses (`authorization_response_iss_parameter_supported: true`), scope challenges (401 `scope`, 403
  `insufficient_scope`), refresh token rotation for public clients, exact redirect URI matching (any loopback port and name,
  RFC 8252), RFC 7009 revocation. This is backwards compatible with clients built for 2025-06-18 and 2025-11-25 authorization.
- **Transport and lifecycle: MCP 2025-11-25** Streamable HTTP (via the official Kotlin SDK 0.16.0, the latest release; it
  negotiates 2024-11-05 through 2025-11-25): stateless, JSON responses, no sessions, `initialize` + `tools/list` + `tools/call`.
  The 2026-07-28 stateless protocol (`server/discover`, no `initialize`) is not in the Kotlin SDK yet (0.16.0 has its types
  only); 2026-07-28 clients fall back to the initialize handshake per the spec's backward-compatibility rules: a request
  without `initialize` gets a 400 whose body is not one of the new protocol errors (`-32020`..`-32022`), which is what tells
  them to (`McpServerTest` pins this). Upgrade the SDK when it serves 2026-07-28.

### 20.2 Where things live

| URL (default, `APP_BASE_URL` = issuer) | Served by |
|---|---|
| `${APP}/mcp` (the resource, `MCP_RESOURCE_URL`) | Next.js rewrite → `POST /v1/mcp/customer` |
| `${APP}/mcp/business` (the business resource, `MCP_BUSINESS_RESOURCE_URL`; not while `BUSINESS_MCP_ENABLED=false`) | rewrite → `POST /v1/mcp/business` |
| `${APP}/.well-known/oauth-protected-resource/mcp` (and the root form), `…/mcp/business` | rewrite → backend |
| `${APP}/.well-known/oauth-authorization-server` | rewrite → backend |
| `${APP}/oauth/authorize` (authorization endpoint) | **Next.js consent page** (signs in with Clerk or dev auth, then calls `GET/POST /v1/oauth/authorize`) |
| `${APP}/api/v1/oauth/token`, `/register`, `/revoke` | backend via the `/api` rewrite |

The user-authentication step is our existing web login, so the authorization server stays independent of Clerk.

### 20.3 Data (per user; no RLS)

```
oauth_clients(client_id PK, kind ('dynamic'|'metadata_document'), client_name, client_uri, redirect_uris[], metadata, created_at,
  refresh_after NULL)                         -- metadata documents are cached (HTTP max-age, 5 min..24 h, default 1 h)
oauth_grants(id, user_id, client_id, scopes[], resource, consented_redirect_uri, consented_at, last_used_at, revoked_at)
  -- the consent record and "connected app"; one active grant per (user, client, resource): connecting the same app to
  -- the business server keeps its customer grant
oauth_codes(code_hash PK, grant_id, redirect_uri, code_challenge, scopes[], resource, expires_at, used_at)
oauth_tokens(token_hash PK, grant_id, kind ('access'|'refresh'), scopes[], resource, expires_at, used_at, revoked_at)
```

Codes and tokens are opaque random secrets (`bac_`, `bat_`, `bar_` prefixes, 32 bytes) stored as SHA-256 hashes only
(`TokenStore` seam, `PgTokenStore`). Codes live 5 minutes and are single use; access tokens 1 hour; refresh tokens 30 days and
single use (rotation). Presenting a used code revokes the whole grant (theft detection), and so does presenting a rotated
refresh token, with one exception (`TokenPolicy.REFRESH_REUSE_GRACE`): clients refresh from several requests at once, or
retry after losing the response, and would otherwise be disconnected. So within 60 seconds of its rotation, until one of its
successors is used (`parent_hash`) and at most 5 times (`reuse_count`), a rotated refresh token presented with the same
`client_id` gets a new pair of its own; the earlier successors keep working (only hashes are stored, so the same pair can't be
returned). Clients are public, so the `client_id` proves nothing: a thief who presents a stolen token in that minute gets a
chain of their own and is not caught then. That is the price of not disconnecting clients that race themselves. Every pair is
cut down to what the grant covers when it is issued, in the same transaction that locks the grant row (`FOR SHARE`), so no
pair outlives a narrowed consent, however a refresh or code exchange interleaves with it.

### 20.4 Flows and rules

- **Clients**: public only (`token_endpoint_auth_method: none`, PKCE required). DCR (`POST /v1/oauth/register`, RFC 7591):
  redirect URIs must be https, http on a loopback host, or a private-use scheme (no `javascript:`, `data:`, …), 1..10. A
  loopback redirect matches on any port and any of `localhost`, `127.0.0.1` and `[::1]` (same scheme, path and query).
  Metadata documents: an https `client_id` with a path is fetched SSRF-safely (public addresses only, checked per connection, no
  redirects, 2 s, 5 KB, JSON), must name itself exactly, list valid `redirect_uris`, a `client_name`, and `none` authentication.
  Only the authorization endpoint fetches (at most 4 at a time; a document that failed is not fetched again for 5 minutes); the
  token endpoint only knows clients stored by then. A refused document is logged with the reason (`ClientRegistry`, warn: the
  user only sees that the app can't be connected). The token and revocation endpoints take `client_id` in the form or, when
  the form has none, from `Authorization: Basic` (RFC 6749 2.3.1, the password ignored: there are no secrets; an unencoded
  `https://` client_id is read up to the last colon).
- **Authorize**: unknown client or unregistered redirect → our error page, never redirected. Otherwise errors
  (`unsupported_response_type`, `invalid_request` for missing/non-S256 PKCE, `invalid_target` for another `resource`) go back
  to the registered redirect with `state` and `iss`. The consent screen shows the app, where it will send the user (hostname,
  required by the spec), a warning for loopback/app-only redirects, the scopes and the signed-in account.
  It shows an app website only when verified (a metadata document's own host; a registered `client_uri` only on the redirect host).
  Approving upserts the grant (the consent record) and issues a code; denying returns `access_denied`. Approving fewer scopes
  than before revokes the grant's tokens (and deletes its unused codes) holding a scope the new consent does not cover.
- **Token** (form-encoded, `Cache-Control: no-store`): `authorization_code` checks client, exact `redirect_uri`, PKCE and resource;
  `refresh_token` rotates and may narrow `scope` (asking for more than the grant is `invalid_scope`; values that aren't the
  resource's scopes are dropped as below). The response's `scope` is what was granted. Errors per RFC 6749 (`invalid_grant`,
  `invalid_client` 401, …).
- **Scopes**: each belongs to one resource. Customer: `bookings:read`, `bookings:write` (implies read), `marketplace:read`.
  Business: `business:read`, `business:write` (implies read). Scope requests are lenient, never `invalid_scope` at the
  authorization endpoint: values that aren't scopes of the requested resource (`openid`, `profile`, `email`, or the other
  server's scopes, which clients copy from the authorization server metadata) are dropped, and when none remain (or `scope` is
  empty) the request is for all of the resource's. The authorization server metadata lists every served scope; each protected
  resource metadata lists only its own. A request without `resource` is for the business server only when every scope it asks for is a
  business scope (and the server is on), else the customer one. `offline_access` is accepted (refresh tokens are always issued).
- **Resource servers** (`/v1/mcp/customer`, `/v1/mcp/business`): only our access tokens, unexpired, unrevoked, grant active and
  issued for that server's resource (audience binding: a customer token is refused by the business server and the other way
  round; our web session JWTs are rejected, no passthrough). A refresh for a resource that is no longer served is `invalid_target`. 401 +
  `WWW-Authenticate: Bearer resource_metadata="…", scope="…"` (+ `error="invalid_token"`); a `tools/call` without the tool's
  scope → 403 `error="insufficient_scope"` with the scopes needed (plus those already granted).
- **Rate limits**: AI platforms (Claude, ChatGPT) call from a few shared egress addresses for all their users, so per-IP limits
  are only flood ceilings there: token/revoke 600/min, registration 300/hour, customer MCP 3000/min before authentication.
  After authentication the customer MCP is limited per grant (120 requests/min; search and availability as the public API)
  and bookings per user (the public booking limit and 10 MCP bookings per 10 minutes). Consent decisions (people's browsers):
  60 per 10 minutes per IP. `RateLimiter.checkKey` keys a limit by subject instead of IP.
- **Connected apps**: `GET /v1/me/connected-apps`, `DELETE /v1/me/connected-apps/{grantId}` (revokes every token); UI at
  `/my/connected-apps`.
- **CORS**: the well-known documents, `/v1/oauth/register|token|revoke` and the MCP servers allow any origin (bearer tokens or
  public data only, no cookies), exposing `WWW-Authenticate`, for browser-based MCP clients. The MCP servers allow the
  `Authorization`, `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` request headers (2026-07-28 clients send the last two
  on every request; a preflight refusing them fails before the client can fall back to an older version). The token and
  revocation endpoints allow `Authorization` too (Basic client identification). The consent API (`/v1/oauth/authorize`) and
  everything else keep the default same-origin policy.
- **Origin** (Streamable HTTP: an `Origin` that is present and invalid gets 403): the MCP routes refuse, before CORS and
  authentication, an `Origin` of `null` (sandboxed frames, `file:` pages) or anything that isn't `scheme://host[:port]`, with a
  JSON-RPC error with a null id (`McpOriginCheck`). Every real origin is allowed: the rule exists against DNS rebinding of
  local servers, while ours are public, take bearer tokens and never cookies, and browser-based clients run on their own
  sites. Requests without `Origin` (desktop and server-side clients) are unaffected.
- **Consent page hardening**: `/oauth/*` is served with `X-Frame-Options: DENY`, `frame-ancestors 'none'` (no clickjacking of
  "Allow") and `Referrer-Policy: no-referrer`; it only ever navigates to a `redirectTo` returned by the API (a registered redirect).

### 20.5 Customer tools (`mcp/customer/CustomerTools`, one registry entry per tool)

| Tool | Scope | Does |
|---|---|---|
| `search_marketplace` | marketplace:read | §18 search (text, city or point + radius, category, date, deals, paging) |
| `get_business` | marketplace:read | profile, policies, services (options, add-ons, resource, questions), deals, `bookingUrl` |
| `check_availability` | marketplace:read | free times with deal prices, using the customer's own group at that business; `after` steps forward (a business offering only its next available time returns one time and `nextAvailableOnly: true`) |
| `book` | bookings:write | prepares a booking request (`slug`, `serviceId`, `start`; `optionId`, `addonIds`, `resourceId`, `answers`, `notes`, `phone`, `payment: online \| at_venue`) as the user (verified email, their group); deals apply; nothing is booked until it goes ahead (§20.9) |
| `list_my_bookings` | bookings:read | upcoming / past / all (`status`, `limit` 1-50) |
| `get_next_appointment` | bookings:read | next upcoming booking or null |
| `find_times_to_move` | bookings:read | the times one of the user's bookings can move to (`bookingId`, `from`, `to`, `resourceId`, `after`): its own slot free, its deal's schedule |
| `get_payment_link` | bookings:read | the checkout link of a booking still held for payment (`bookingId`) |
| `reschedule_booking` | bookings:write | prepares a move (`bookingId`, `start`, `resourceId`) under the customer rules (notice window, deal schedule) |
| `cancel_booking` | bookings:write | prepares a cancellation (`bookingId`, `reason`) with the refund the policy gives now |
| `confirm_action` | bookings:write | carries out a prepared request that is `awaiting_confirmation` (`proposalId`); idempotent |
| `cancel_action` | bookings:write | drops a prepared request (`proposalId`) |
| `get_proposal` | bookings:read | where a request stands (`proposalId`): awaiting approval (with `approvalUrl`) or confirmation, confirmed (with the booking and links), rejected, expired, failed |

**How tools are listed** (all three servers, `McpTool.listed`): each has an `outputSchema` generated from its result DTOs
(`OutputSchemas`: every property required since the API writes defaults and nulls, nullable ones `["type", "null"]`, enums
listed, additional properties allowed); clients such as the TypeScript SDK reject `structuredContent` that doesn't match, and
every test that calls a tool checks the result against it (`McpOutputCheck`). Each tool and server carries our icon (`icons`:
`/icon.svg`, `/icon-192.png`, `/icon-512.png` on the app origin), and `_meta.securitySchemes` says how it is authorized
(ChatGPT reads it): `[{type: "oauth2", scopes: [<the tool's scope>]}]` on the signed-in servers, `[{type: "noauth"}]` on the
anonymous one. Annotations: reads are `readOnlyHint`; `book`, `reschedule_booking`, `cancel_booking` and the business write
tools only prepare a change, so they are not `openWorldHint` (nothing reaches anyone else until it goes ahead);
`confirm_action` is `destructiveHint` and `openWorldHint`, since carrying out a change books, moves or cancels with a business
(or, on the business server, changes a customer's booking).

Every tool goes through the same services as the website (`PublicBooking`, `MeService`, `BookingEngine`, `BookingLifecycle`);
another customer's booking is `NOT_FOUND`. Bookings get `source=api`; audit events use actor `api` with the user and
`via: "oauth:<client_id>"`. Arguments are decoded strictly (unknown or mistyped arguments are `INVALID_REQUEST`).

### 20.6 Anonymous MCP

`POST /v1/mcp` stays public and **read-only**: `search_marketplace`, `find_business`, `list_services`, `check_availability`. It no
longer creates bookings (an assistant must act as a real, verified customer through the signed-in server).

### 20.7 Business MCP (members' own AI agents)

Owners, admins and staff connect their own agent (Claude, ChatGPT, …) to `${APP}/mcp/business` and run the business from it, as
their role allows. Bo (§17) stays the in-dashboard assistant; the business server serves **Bo's tools** (`ToolRegistry`, minus
`update_memory`, which edits Bo's own prompt) through `mcp/business/BusinessTools`, so a tool added for Bo is served here too.

- **Kill switch**: `BUSINESS_MCP_ENABLED` (on unless `false`). Off: the route, its protected resource
  metadata and its scopes are not served or advertised, authorization for it is `invalid_target`, its tokens stop working, and
  the dashboard hides Settings › AI agents (`Business.aiAgentsAvailable`).
- **Consent**: the consent page lists every business the user is an active member of, with their role and whether they may use
  agents there, and says changes wait for their approval. Someone who belongs to none is told so on our page (409 `POLICY_VIOLATION`; nothing is redirected to the app).
- **Which business**: one grant reaches all of the user's businesses. `list_my_businesses` lists them (slug, role, timezone,
  today's date there, `aiAgentsAllowed`); every other tool takes `business` (slug or id; optional with a single business).
  Each call resolves the membership afresh (`Memberships.require`): role, staff scope (own resources) and suspension apply at
  the moment of the call, so removing a member cuts their agent off at once. Tools above the member's highest role are not
  listed; a tool above their role at the named business is `FORBIDDEN`.
- **Who may**: `businesses.ai_agents_access` (`AiAgentsAccess`): `admins` by default (owners and admins have it from the start),
  `team` (staff too, with their staff scope) or `off`. Only an owner changes it (Settings › AI agents, `PATCH /businesses/{id}`
  `aiAgentsAccess`; admins get 403): a member's third-party app reaches the business's customers' details, which the business
  is responsible for. A member it doesn't allow gets `FORBIDDEN` on every call for that business, saying why; the consent page
  still lists the business, marked not allowed. Bo is unaffected.
- **Reads** run Bo's read tools as the member and return `{business, summary, data}`. Customer-entered text carries the
  untrusted-data note; sensitive answers are never included (as for Bo).
- **Writes never run in the call.** They validate and return a proposal (`proposalId`, title, summary, changes, items, warnings,
  `expiresAt`, `approvalUrl`), stored as a pending `assistant_actions` row tied to the grant (`oauth_grant_id`; `thread_id` and
  `tool_use_id` are null, one or the other origin is enforced by a check). How it goes ahead is §20.8: by default only the member
  approving it on bookanything carries it out. Either way it runs through `ActionService` exactly as Bo's confirm (row locked,
  savepoint, idempotent, `requireRole` again), audited as actor `ai` with `via: oauth:<client_id>` and `approvedBy`
  (`member` | `app`); `cancel_action` drops it. Only the grant that proposed (or the member, §20.8) can decide a proposal; Bo's
  dashboard confirm route refuses it, and an app can't decide Bo's. `confirm_action` is annotated `destructiveHint` and
  `openWorldHint` (§20.5).
- **Tools added with it** (for Bo too): `get_booking` (detail, payments, history), `approve_bookings`, `decline_booking`,
  `set_booking_outcome` (completed / no-show), `mark_paid_in_person`, `update_booking_notes`, `get_customer`, `create_customer`,
  `update_customer`, `list_time_off`, `remove_time_off`, and for admins `list_deals`, `pause_or_resume_deal`. Out of scope, as
  for Bo (§17.4): billing and payouts, deleting the business, team roles and invitations, customer erasure and export, the site.
- **Limits**: 3000/min per IP before authentication; 120 requests/min per grant; 60 proposals per 10 minutes per grant;
  60 confirmations per 10 minutes per user (across their apps).

### 20.8 Approvals (a person approves what their agent changes)

An agent proposing and confirming with the same token can't prove a person agreed. So by default **the member approves every
change on bookanything itself**, signed in with their normal session, which an app's access token can't stand in for (it is
only valid at the MCP, §20.4).

- **Needs approval** (`assistant_actions.needs_approval`, set when proposed): unless the business auto-approves the tool's kind
  (`businesses.ai_agents_auto_approve`, owner only, none by default) and it changes a single item. Each write tool declares its
  `changeKind` (`AgentChangeKind`: `records` notes and customer records; `bookings` new bookings, moves, approving requests,
  outcomes, payments in person, payment links; `cancellations` cancelling and declining; `time_off`; `settings` opening hours,
  services, deals) and `count(input)` (the bookings a bulk tool changes): a change to several is never auto-approved.
- **Flow**: the proposal comes back `awaiting_approval` with `approvalUrl` (`${APP}/dashboard/{slug}/approvals/{id}`), and the
  agent is told to give the member the link. There they see the proposal card (Bo's, §17) with the app's name, and Approve runs
  it (`POST …/agent-requests/{id}/approve`, origin `Approval`: the member's own app proposals only, the app still connected, the
  business still allowing them agents). `confirm_action` on it changes nothing and answers `awaiting_approval` with the link
  again; `get_proposal` (read scope) tells the agent the outcome. `/dashboard/{slug}/approvals` lists the member's requests of the
  last week, waiting ones first. A proposal awaiting approval lasts 24 hours, so it is prepared again
  (`ActionService.refresh`) when the member opens it and when they approve: if what would happen changed meanwhile (a refund,
  a price, the record it edits), the new preview is stored and approving answers 409 so they see it first.
- **Auto-approved kinds** come back `awaiting_confirmation` (30 minutes) and `confirm_action` runs them, as before: the person in
  the loop is the agent's instructions and the client's tool prompt. Rules are checked again when the app confirms: if the owner
  has since required approval, the proposal switches to waiting for it.

### 20.9 Customers' approvals

A customer's AI app (customer MCP) asks the same way (`mcp/customer/CustomerRequests`, table `customer_agent_requests`, per
user, keyed to the grant and the business). `book`, `reschedule_booking` and `cancel_booking` only prepare a request,
checked as the website would (the time is among the free times the customer could pick, required questions answered,
payment at the venue allowed, the booking still theirs and movable or cancellable) and previewed with the price (deals
applied, `BookingQuote.preview`) or the refund. It is `awaiting_approval` (24 hours): the customer is notified and approves
it at `/my/approvals/{id}` (`POST /v1/me/agent-requests/{id}/approve`, signed in), which books, moves or cancels through
the website's own commands as the customer, audited as actor `api` via the app; a paid booking's result links to its
payment page. Kinds the customer lets go ahead (`users.agent_auto_approve`: `bookings` (book, move), `cancellations`; none
by default; Connected apps page) are `awaiting_confirmation` (30 minutes) and the app's `confirm_action` runs them.
`get_proposal` and `cancel_action` as on the business server. As there, the request is prepared again when the customer
opens it and when they approve (409 when it changed), a disconnected app's requests can't go ahead, and only the app that
asked (or the customer) can see or decide one. Carrying one out claims it first (`status = confirmed`, row locked) and then
runs the command, so approving twice books once (the booking's idempotency key is the request id); any failure after the
claim is recorded (`failed`, the customer told to check their bookings), so a request never hangs. Requests are kept 90
days and deleted with the account.

### 20.10 WebMCP (agents in the visitor's browser)

Customers bring their own AI: besides connecting an assistant to the customer MCP (§20), an agent built into their browser
can use our pages directly through WebMCP (W3C Web Machine Learning Community Group draft; Chrome and Edge origin trials).
A page registers tools on `document.modelContext`; the agent calls them in the visitor's own tab, with their session, while
they watch. There is no OAuth and no server side: the tools drive the page and call the API exactly as the page does.

| Page | Tools (`components/…`) |
|---|---|
| Booking flow `/[slug]/book` | `get_booking_options`, `check_availability`, `select_appointment`, `fill_booking_details`, `get_booking_status`, `confirm_booking` (`booking/booking-agent-tools.ts`) |
| Marketplace `/explore` | `search_businesses` (sets the page's own filters, so the visitor sees the results the agent reads), `open_business` (its page or booking flow, whose tools take over) (`explore/explore-agent-tools.ts`) |
| My bookings `/my/bookings` (signed in) | `list_my_bookings`, `cancel_booking`, `reschedule_booking` (`booking/my-bookings-agent-tools.ts`) |

- **Loading**: `lib/webmcp/use-model-context-tools.ts` registers a page's tools with an `AbortSignal` for as long as the
  page is shown, and imports them only where `document.modelContext` exists (Chrome before 150: `navigator.modelContext`), so
  other browsers download nothing. The tools read the page's state as last rendered. Explore's are registered by its layout,
  so a search that moves to a city's page doesn't unregister them mid-call; `search_businesses` fetches through the page's
  own query (same key, page size and cache).
- **Input and output**: input is checked like form input (`lib/booking/agent.ts`); results are in words (dates and times in
  the business's zone, formatted prices) and never repeat sensitive answers (`lib/booking/agent-views.ts`). A failure is
  returned as `{ error }` rather than thrown (a thrown error reaches the agent only as "tool rejected"). Every tool declares
  an `outputSchema`: its result with the keys always present required, or `{ error }` (`toolOutput`); the unit tests check
  each result against it (ajv, `src/test/model-context.ts`).
- **One change at a time on My bookings**: while a cancellation or move the agent opened is showing, another is refused,
  and it lapses once the booking is no longer upcoming.
- **Nothing consequential happens silently**: `confirm_booking`, `cancel_booking` and `reschedule_booking` are
  `consequentialHint` (browsers may ask the user first). `confirm_booking` works only on the review step, after the customer
  has seen the summary and price, and payment stays on the payment provider's page. `cancel_booking` and `reschedule_booking`
  only open the booking card's own dialog (the refund, or the free times): the customer confirms there or dismisses it.
  Reads that return what a business wrote are `untrustedContentHint`.
- **Origin trials**: `WEBMCP_ORIGIN_TRIAL_TOKEN` (Chrome) and `WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN` (Edge) are sent together in
  one `Origin-Trial` header on every page (`next.config.ts`: a trial is per document, and visitors reach the pages with
  tools by client-side navigation); each browser uses the token it signed.
- **Tests**: Vitest drives each page's tools through a fake `document.modelContext`; the Playwright `webmcp.spec.ts`
  installs a stand-in before the page loads and runs explore → booking page and a cancellation that only opens the dialog.

### 20.11 Client compatibility notes

What the MCP clients we've seen expect of the servers and the authorization server, and what we do about it.

- **Claude** (claude.ai, the desktop app, Claude Code): redirects to `https://claude.ai/api/mcp/auth_callback` (Claude Code:
  a loopback port). It identifies itself with a client ID metadata document only when `token_endpoint_auth_methods_supported`
  includes `none` (ours is exactly `["none"]`), otherwise it registers (DCR). It checks that the protected resource metadata's
  `resource` is exactly the URL the user typed, so the help page (`/help/ai-assistant`) shows the canonical
  `${NEXT_PUBLIC_APP_URL}/mcp`: no trailing slash, the configured host. Next answers `/mcp/` with a 308 to `/mcp`, and the
  metadata keeps saying `/mcp`, so a URL typed with a trailing slash, or on a host the deployment redirects (`www.` to the
  apex), fails that check; users should paste the URL as shown. (Our own RFC 8707 comparison ignores a trailing slash and
  host case.)
- **ChatGPT**: redirects to `https://chatgpt.com/connector_platform_oauth_redirect` (its stable URI, used because we send
  RFC 9207 `iss`), sends `resource` on both the authorization and token requests, asks for the advertised scopes, and reads
  `_meta.securitySchemes` (§20.5) to know which tools need the account.
- **Cursor**: registers with DCR as a public client, with `https://www.cursor.com/agents/mcp/oauth/callback` (web and its
  agents) and `http://localhost:8787/callback` (desktop). Unless the user configures scopes, it asks for every
  `scopes_supported` of the authorization server metadata, the business server's included: those are dropped (§20.4, scopes)
  rather than failing with `invalid_scope` as they used to.
- **2026-07-28 clients** send `Mcp-Method` and `Mcp-Name` on every request (allowed by CORS, §20.4) and try a request without
  `initialize` first; our 400 isn't one of the new protocol errors, so they fall back to `initialize` and 2025-11-25 (§20.1).
- **Clients refreshing in parallel** (several requests find the access token expired at once) or retrying a lost response get
  a new pair within the reuse grace minute (§20.3) instead of being disconnected.
- **Browser-based clients** (MCP inspectors, web apps) call the metadata, token endpoint and MCP servers cross-origin with
  bearer tokens; an `Origin` of `null` is refused (§20.4).
- **MCP conformance suite** (`npx @modelcontextprotocol/conformance server --url …/v1/mcp`, 0.1.16, active suite, run against
  the anonymous server): initialize, ping, `tools/list`, a text tool call and a tool error pass. The other scenarios exercise
  what we don't offer and fail as expected (`-32601` for prompts, resources, logging and completion; no sampling,
  elicitation or progress; the reference server's fixture tools such as image or audio content), and its DNS-rebinding check
  expects a localhost server to refuse a foreign `Host`/`Origin`, while ours are public servers that allow every real origin
  (§20.4, Origin). Re-run it after SDK upgrades; anything else failing is real.
- Needs a live deployment to confirm: the `www.`/apex redirect and trailing-slash behaviour on the real host, the
  `Origin-Trial` header, and each client's connection end to end.

## 21. Release schedules (when days open for online booking)

A business decides when each day's times go on sale, not only how far ahead people may book: a GP practice opens
tomorrow's medical card appointments at 17:00 today while private appointments and blood tests can be booked weeks
ahead; a clinic opens next week every Friday at 22:00. Staff can change one day's release (open it now, move it, hold
it) without changing the schedule, like one occurrence of a recurring calendar event. Staff bookings ignore releases.

### 21.1 Data

```
release_schedules(id, business_id, name, cadence ('daily'|'weekly'), release_time TIME,
  days_before NULL (daily, 0..14), weekdays_only BOOL (daily), weekday NULL (weekly, ISO 1..7), weeks_ahead NULL (weekly, 1..4),
  everyone BOOL, status ('active'|'paused'), created_at, updated_at)
release_schedule_services(business_id, schedule_id, service_id)
release_schedule_groups(business_id, schedule_id, group_id)          -- when everyone = false
release_changes(id, business_id, schedule_id, date, opens_at NULL (NULL = held), created_by_user_id NULL, created_at, updated_at,
  UNIQUE(schedule_id, date))
```

Nothing records that a day opened: availability works it out from the schedule, the day's change and the clock.

### 21.2 Rules (pure: `ReleaseCalendar`, `ReleaseBook`)

- **When a day opens** (business timezone): daily, `days_before` days before it at `release_time`, and with
  `weekdays_only` a release falling on Saturday or Sunday happens on the Friday before; weekly, on `weekday` of the week
  `weeks_ahead` weeks before the day's week (Monday to Sunday), at `release_time`. A release time in the spring DST gap
  moves forward by the gap (as `ZonedDateTime.of`). A change replaces the day's opening (`opens_at`), or holds it (NULL).
- **Who it covers** (`ReleaseBook.covering`): an active schedule covers its services for everyone, or for its groups.
  Unrestricted customers all see the same hours, so a customer in an unrestricted group no schedule names for the
  service, or in no group, is covered by every schedule naming an unrestricted group: picking another group, or none,
  must not get round one. Schedules for restricted groups cover only their own. A service and group can be in only one
  schedule (an overlap is a field error), but such a customer can meet several: the latest opening wins and a held day
  stays closed. A group a schedule names is deactivated rather than deleted (`CustomerGroupRepository.isInUse`).
- **Customer availability** (`AvailabilityMode.PUBLIC`: the booking page, manage link and `/me` reschedule, the customer
  MCP, the marketplace and deals) drops the times of a covered day until it opens and says so on the day: `opensAt`
  (when) or `held: true`. Only days that would have times are marked. Booking and rescheduling re-check the slot the same
  way (`SLOT_UNAVAILABLE`). Min notice and max advance still apply. `nextAvailableOnly` offers the earliest open time
  and tells only the soonest opening (a lock on every closed day would say which days have times).
- **Changing a schedule's timing never closes a day it already opened**: saving writes a change keeping each such day
  open from when it opened (`ReleaseCalendar.closedByChange`). Creating or resuming a schedule closes its unopened days
  straight away; closing an open day again is a hold.
- **One release**: a change applies to the day and (scope `release`, the default) every day the schedule opens at the same
  moment (a week, or a weekend opened on the Friday); days before today are left alone. A move must open before the
  (last) day ends. Changes and schedule edits are serialised per business (advisory lock), so a keep-open step can't
  overwrite a hold made meanwhile.

### 21.3 API (prefix `/v1/businesses/{businessId}`, owner/admin)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/release-schedules` | `ReleaseSchedule[]` / `ReleaseScheduleInput` → 201 (at most 20 per business) |
| PUT/DELETE | `/release-schedules/{scheduleId}` | `ReleaseScheduleInput` → `ReleaseSchedule` / 204 |
| PUT | `/release-schedules/{scheduleId}/changes/{date}` | `{action: open_now\|move\|hold, opensAt?, scope?: release\|day}` → `Releases` (the changed days) |
| DELETE | `/release-schedules/{scheduleId}/changes/{date}?scope=` | back on schedule → `Releases` |
| GET | `/releases?from&to` | ≤ 31 days: each active schedule's day by day `scheduledAt`, `opensAt`, `state` (open, scheduled, moved, held), who changed it, and `times` (distinct free starts of its public services for its customers, open yet or not; one batched availability read) |

Audit: `release_schedule.created|updated|deleted`, `release.open_now|move|hold|reset` (entity: the schedule; summary: the
dates and opening).

### 21.4 UI

Settings → Release schedules (schedules in a sentence, the services no schedule covers, the next fortnight's releases with
Open now / Change / Hold / Reset); the schedule editor previews when the coming days would open; the calendar shows a
release row under the day headers whose chips open the same actions for one day; the overview shows a release due in the
next 24 hours; the booking page marks closed days with a lock and says when they open, counting down and refetching at
that moment.

## 22. Notifications

What each person should know, in the app and by email (`notifications/inbox`). One table, `notifications`, per user
across businesses (`business_id` the business it is about, `entity_id` the booking or proposal), with the standard tenant
policy so a transaction scoped to one business only touches that business's rows; the person's own reads are unscoped
by `user_id`.

- **Kinds** (`InboxKind`): `agent_approval` (an AI app's change waits for the person's approval, business or customer
  side; emailed by default), and for the team `booking_request`, `new_booking`, `booking_cancelled`, `booking_moved`
  (in the app only by default: the business's contact email already gets new bookings), and for owners
  `payments_alert` (taking payments needs them: Stripe was disconnected; emailed by default).
- **Who**: approvals go to the person whose app asked. Booking news goes to the business's active owners and admins and
  to staff whose own resource the booking is on (`resources.member_id`), and only for what customers do (online, through
  their AI assistant): new bookings and requests whenever the business is emailed about them (in that job, so the booking
  request itself does no more work), cancellations by the customer (not a checkout they abandoned), moves by the customer
  or their app (staff on the old and the new resources both hear).
- **Stored in the event's transaction**, once per thing that happened (`dedupe_key`; a move has none: each is news), so a
  retried job never repeats one. Deciding an approval marks its notification read.
- **Email**: each notification queues an `inbox-email` job a minute later (`Inbox.EMAIL_DELAY`); it sends the
  `notification` template (bookanything's own look) only if the person still hasn't read it and wants that kind by email
  (`notification_preferences`, else the kind's default), and only once (`emailed_at`).
- **Push** (the mobile app, `notifications/push`): the app registers the phone it runs on with
  `POST /v1/me/push-devices` `{"token":"ExponentPushToken[…]","platform":"ios|android","appVariant":"development|preview|production"}`
  (200 `{id, platform, appVariant, createdAt, lastSeenAt}`) on every launch and sign-in, and `DELETE /v1/me/push-devices`
  `{"token"}` (204, only ever the caller's) on sign-out. `push_devices` is per user (no RLS): a token belongs to whoever
  signed in on that phone last (registering it moves it and turns it back on), a person keeps at most 20 (the one seen
  longest ago is revoked). When push is on (`PUSH_NOTIFICATIONS`) and the person has a phone, each notification also
  queues a `push-send` job in its transaction: unless read by then, one Expo message per phone (the business's name or
  "bookanything", the kind's generic sentence such as "New booking": a locked phone shows no customer, service, time or
  proposal; `data: {link, notificationId, kind}`, the unread count as badge, `channelId: "default"`, high priority for
  approvals), one request per app variant, at most 100 messages each. Tickets and, 15 minutes later
  (`push-receipts`), receipts saying `DeviceNotRegistered` revoke the phone (unless it registered again since); other
  errors are logged, never retried; Expo unreachable, 429 or 5xx is retried by the queue (5 tries; phones already
  reached are not pushed again). The `PushSender` seam: `ExpoPushSender`, `LogPushSender` (development), or off.
- **API**: `GET /v1/me/notifications` (30 newest, unread count), `POST …/{id}/read`, `POST …/read-all`,
  `GET|PATCH /v1/me/notification-settings`, `POST|DELETE /v1/me/push-devices`.
- **Frontend**: the bell (`components/notifications/notification-bell.tsx`) in the dashboard sidebar and phone top bar
  and on `/my` pages, polling every 30 seconds and on focus; `/my/notifications` lists everything and the email choices
  (team kinds only for members of a business).
- **Retention**: deleted after 180 days (`Retention`). A customer's erasure deletes the team's notifications that name them
  (about their bookings, or an AI agent's change whose summary does) and their name in notification email subjects; a
  deleted account takes its notifications, choices and phones with it. Phones are purged 30 days after they were revoked
  and 270 days after the app last registered them.

## 23. Mobile app

Expo SDK 57 / React Native (new architecture, Hermes), expo-router, TypeScript strict, in `mobile/`. Full design:
[`docs/mobile.md`](mobile.md); conventions for feature work: `mobile/README.md`.

- **Same API, same rules.** The app calls the API origin directly (no `/api` rewrite): `configureApiClient({ baseUrl })`
  in the shared client. Requests carry the Clerk session JWT in production and dev tokens (§3.2) in development.
  The backend accepts the app's Clerk sessions, which carry no `azp`, once `CLERK_ACCEPT_NATIVE_SESSIONS=true` (§3.1;
  set it in production with the store build). The only mobile-specific API is the phone registration for push
  notifications (`/v1/me/push-devices`, §22).
- **Shared code.** The app compiles the website's platform-agnostic `frontend/src/lib` in place (`@shared/*`): API
  client and types, query keys and hooks, formatting, vocabulary, validation, booking rules, permissions and the
  dashboard navigation model (`lib/dashboard/nav.ts`). `lib` modules are platform-agnostic unless listed in
  `WEB_ONLY_LIB` (frontend ESLint); the app's boundary test checks the import graph it uses.
- **Routes mirror the website's paths** (`/my/bookings`, `/my/approvals/[id]`, `/dashboard/[slug]/…`, `/[slug]/book`,
  `/manage/[token]`, `/invitations/[token]`), so universal links, emails and notifications open the same page in the
  app (iOS associated domains / Android app links for `/my`, `/dashboard`, `/manage`, `/invitations`, `/explore`).
- **Left to the website on purpose**: the site builder, Stripe-hosted pages (Checkout, Connect onboarding, billing
  portal) and the OAuth consent page, opened in an in-app browser.
