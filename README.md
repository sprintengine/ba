# bookanything

A premium, AI-native booking platform for any appointment-based business
(physio, car wash, music lessons, GP practice, and anything else) at
**bookanything.ie**. One site: business owners and staff sign in to a
dashboard, and customers book, pay and manage their bookings.

- Technical design and API contract: [`docs/architecture.md`](docs/architecture.md)
- Backend handbook: [`backend/README.md`](backend/README.md) (Kotlin, Ktor, PostgreSQL; spec in `backend/openapi.yaml`)
- Frontend handbook: [`frontend/README.md`](frontend/README.md) (Next.js 16, Tailwind v4 design system)
- Mobile app: [`docs/mobile.md`](docs/mobile.md) (architecture) and [`mobile/README.md`](mobile/README.md) (Expo,
  iPhone/iPad/Android; shares `frontend/src/lib`)
- Engineering guide: [`docs/engineering.md`](docs/engineering.md) (module layout, layering, errors, testing, how to add
  a feature, lint/format/coverage checks)

## Prerequisites

- JDK 21 (the Gradle wrapper is included)
- Node.js 22+ and npm
- Docker (Colima works), for Postgres and Testcontainers

## Run it locally

```sh
docker compose up -d postgres            # Postgres 16 on :5432 (bookanything/bookanything)
npm run backend:install                  # ./gradlew :backend:installDist
npm run backend:seed                     # migrate + seed demo businesses (safe to rerun)
npm run backend:dev                      # API on http://localhost:8080 with dev auth
npm --prefix frontend install
npm run frontend:dev                     # http://localhost:3000
npm run mobile:install && npm run mobile:ios   # the app on the iOS simulator (Xcode; see mobile/README.md)
```

With the compose database, export
`DATABASE_USERNAME=bookanything DATABASE_PASSWORD=bookanything` before the
backend commands.

Without Clerk keys, both apps use **dev auth**. The demo accounts are
`owner@bookanything.test`, `staff@bookanything.test` and
`customer@bookanything.test`. The demo businesses are `lumen-physio`,
`gleam-car-wash`, `cadence-music` and `meadowbrook-practice`. Every external
integration (Clerk, Stripe, Resend, Twilio, Anthropic) is optional in
development and switches on when its keys are set. See the env tables in the
two handbooks.

The seed also lists the paid demo businesses (plus a few fictional ones around
Ireland) on the marketplace at `/explore`, with example deals. Customers can
connect their AI assistant to `http://localhost:3000/mcp` (signed-in MCP with
OAuth; guide at `/help/ai-assistant`); geocoding uses Mapbox when
`MAPBOX_ACCESS_TOKEN` is set.

## Checks

```sh
npm test               # backend: ktlint, detekt, tests, coverage floor; frontend and mobile: format, lint, typecheck, tests + coverage
npm run build          # frontend production build
npm run test:e2e       # Playwright (needs the backend running)
```

Colima users: set these before running the backend tests.

```sh
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
export TESTCONTAINERS_RYUK_DISABLED=true
```

CI (`.github/workflows/ci.yml`) runs the same backend, frontend and mobile checks plus a Playwright end-to-end job; see
[`docs/engineering.md`](docs/engineering.md#1-checks).

## Licence

All rights reserved (see [`LICENSE`](LICENSE)). The source is public to read, not to reuse: no part of it may be
used, copied, modified or deployed without written permission.
