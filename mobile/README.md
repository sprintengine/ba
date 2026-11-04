# bookanything mobile

The iPhone, iPad and Android app: Expo SDK 57, React Native 0.86 (new architecture, Hermes), expo-router, TypeScript
strict. Architecture and the reasons behind it: [`docs/mobile.md`](../docs/mobile.md). This file is how to work on it.

> Expo changes every SDK. Before using an Expo or React Native API, read the docs for **SDK 57**
> (https://docs.expo.dev/versions/v57.0.0/) rather than relying on memory, and add native packages with
> `npx expo install <pkg>` so versions match the SDK.

## Run it

Requirements: Node 22+ (CI and EAS use 22), Xcode 26 with an iOS simulator, CocoaPods (run it with a UTF-8 locale:
`export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`, or `pod install` fails), the backend running with dev auth and demo data
(root README: `npm run backend:seed && npm run backend:dev`).

```sh
npm run mobile:install                    # from the repo root (npm --prefix mobile ci)
cd mobile
npx expo run:ios                          # builds the dev client, installs it on a simulator, starts Metro
npx expo run:ios --device "iPad Pro 13"   # a named simulator, or a paired iPhone (see below)
npx expo start --dev-client               # later: just Metro, the installed dev client reloads
npx expo run:android                      # Android emulator (Android Studio)
```

This is a development build (expo-dev-client), not Expo Go: MMKV and Clerk are native modules. `ios/` and `android/`
are generated (`npx expo prebuild --clean`) and git-ignored: change native settings in `app.config.ts` or a config
plugin, never by hand.

**Which backend.** In development the app calls `http://<the Mac's address as Metro serves it>:8080`, so a phone on
the same Wi-Fi reaches the local backend with no setup. Another port: `EXPO_PUBLIC_API_PORT=8090` in
`mobile/.env.local`; another server: `EXPO_PUBLIC_API_URL`. See `.env.example`. Restart Metro after changing env.

**Sign in.** Without `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` the app offers the seeded demo accounts (owner, staff,
customer) or any email: the backend's dev tokens (it must run `AUTH_MODE=dev`). With a key it uses Clerk.

**Configuration.** Public settings are environment variables read by `app.config.ts` into `extra` (EAS environment
variables for builds, `mobile/.env.local` locally, see `.env.example`); the app reads them through `env`
(`src/config/env.ts`). Restart Metro after changing them.

| Variable                            | Default                                        | What it does                                                                                |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `APP_VARIANT`                       | `development`                                  | `development`, `preview` or `production` (set per EAS profile)                              |
| `EXPO_PUBLIC_API_URL`               | development: `http://<Metro host>:8080`        | API origin                                                                                  |
| `EXPO_PUBLIC_API_PORT`              | `8080`                                         | development: the local API's port                                                           |
| `EXPO_PUBLIC_WEB_URL`               | the variant's website (development: `:3000`)   | website origin                                                                              |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | unset: dev sign-in                             | Clerk                                                                                       |
| `EXPO_PUBLIC_SENTRY_DSN`            | unset: no error reporting, Sentry never starts | Sentry crash and error reporting (`docs/mobile.md` "Errors and crash reporting")            |
| `EXPO_PUBLIC_SENTRY_ENVIRONMENT`    | `development` / `staging` / `production`       | overrides the Sentry environment derived from the variant                                   |
| `SENTRY_AUTH_TOKEN` (EAS secret)    | unset: no upload                               | build time only: uploads source maps and debug symbols; with `SENTRY_ORG`, `SENTRY_PROJECT` |

**A physical iPhone.** `npx expo run:ios --device` lists paired devices. Signing uses the team in `app.config.ts`
(`appleTeamId`, override with `APPLE_TEAM_ID`); the phone needs Developer Mode on and the Mac's certificate trusted.

## Folder structure

```
app/                         routes only (expo-router). A route file renders a screen from src/features and sets
                             its header; no logic. URLs mirror the website's (/my/bookings, /dashboard/[slug]/…).
src/
  config/env.ts              variant, API/web URLs, auth mode (read `env`, never process.env)
  api/                       client setup, QueryClient (+ persistence, focus/online), refresh helpers
  auth/                      Clerk and dev auth providers, sign-in screen
  shell/                     navigation model (nav.ts), AdaptiveTabs, BusinessShell, BusinessStack, switcher,
                             header actions, Placeholder, RequireRole, session (where to land)
  ui/                        the design system: tokens, theme, primitives (import from "~/ui")
  lib/                       storage (MMKV, Keychain), logger, links (phone, maps, website)
  features/<area>/           a feature's screens, components and pure logic, tests next to them
  test/                      render helpers, API mock, whole-app renderer, Keychain mock
e2e/flows/                   Maestro flows (e2e/subflows: reusable steps)
scripts/                     design-token lint, shared-code boundary check
```

Imports: `~/…` is this app's `src/`; `@shared/…` is the website's shared `frontend/src/lib/…`. Never import
`@/…` or `../frontend` (ESLint stops you).

## Feature areas: who owns what

Each feature agent owns its `src/features/<area>/` folder and the route files listed; the route files exist already
(placeholders with the final URLs, titles and role guards) so nothing else needs to change to fill them in.

| Area (`src/features/…`)                     | Routes (`app/…`)                                                                                                                                                                                        | Mirrors on the website                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `explore` (**built**)                       | `(customer)/(explore)/explore/index.tsx`                                                                                                                                                                | `/explore`                                                 |
| `booking` (**built**)                       | `(customer)/(explore)/[slug]/index.tsx`, `[slug]/book.tsx`                                                                                                                                              | `/[slug]`, `/[slug]/book` (Stripe Checkout in the browser) |
| `my-bookings` (**built**)                   | `(customer)/(bookings)/my/bookings/*`                                                                                                                                                                   | `/my/bookings`                                             |
| `manage` (**built**)                        | `manage/[token].tsx`                                                                                                                                                                                    | `/manage/[token]` (guest link, signed out)                 |
| `approvals` (customer, **built**)           | `(customer)/(approvals)/my/approvals/*`                                                                                                                                                                 | `/my/approvals`                                            |
| `account` (**built**)                       | `(customer)/(account)/my/index.tsx`                                                                                                                                                                     | `/my`                                                      |
| `notifications` (**built**, push)           | `notifications.tsx` (modal inbox), `(customer)/(account)/my/notifications.tsx`; push                                                                                                                    | bell, `/my/notifications`                                  |
| `connected-apps` (**built**)                | `(customer)/(account)/my/connected-apps.tsx`                                                                                                                                                            | `/my/connected-apps`                                       |
| `connect-ai` (**built**)                    | `connect-ai.tsx` (`?server=customer\|business`)                                                                                                                                                         | `/help/ai-assistant`, `/help/ai-agents-for-business`       |
| `invitations` (**built**)                   | `invitations/[token].tsx`                                                                                                                                                                               | `/invitations/[token]`                                     |
| `overview` (**built**)                      | `dashboard/[slug]/(overview)/index.tsx`, `(overview)/booking/[id].tsx`                                                                                                                                  | `/dashboard/[slug]` (Today)                                |
| `calendar` (**built**)                      | `dashboard/[slug]/calendar/*` (`index`, `[id]`)                                                                                                                                                         | `/dashboard/[slug]/calendar`                               |
| `bookings` (**built**)                      | `dashboard/[slug]/bookings/*` (`index`, `[id]`)                                                                                                                                                         | `/dashboard/[slug]/bookings`                               |
| `customers` (**built**)                     | `dashboard/[slug]/customers/*` (`index`, `[id]`, `booking/[id]`)                                                                                                                                        | `/dashboard/[slug]/customers`                              |
| `services`, `resources`, `team` (**built**) | `dashboard/[slug]/<area>/*` (`index`; `[id]` editor/detail on phones, beside the list on iPad)                                                                                                          | same paths                                                 |
| `offers`, `reports` (admin, **built**)      | `dashboard/[slug]/<area>/*` (offers: `index`, `[id]`, `new` creates)                                                                                                                                    | same paths                                                 |
| `agent-approvals` (**built**)               | `dashboard/[slug]/approvals/*` (`index`, `[id]`)                                                                                                                                                        | `/dashboard/[slug]/approvals`                              |
| `settings` (**built**)                      | `dashboard/[slug]/settings/<section>.tsx` (general, branding, policies, release-schedules, customer-groups, questions, marketplace, ai-agents, payments, billing: read-only plan, see `docs/mobile.md`) | `/dashboard/[slug]/settings/*`                             |
| `onboarding` (**built**)                    | `onboarding/*` (full-screen modal from the switcher's "Set up a new business")                                                                                                                          | `/onboarding`                                              |
| `site` (**built**: opens the web editor)    | `dashboard/[slug]/site/index.tsx`                                                                                                                                                                       | `/dashboard/[slug]/site` (stays on the web)                |
| `assistant` (Bo, voice, **built**)          | `assistant.tsx` (modal, `?business=slug`)                                                                                                                                                               | Bo sheet                                                   |

**Shared files: change them in a small, separate commit and expect others to touch them too.** `src/shell/nav.ts`
(adding a destination), `src/ui/*` (add a primitive rather than changing one's behaviour), `app/_layout.tsx`,
`app/(customer)/_layout.tsx`, `src/shell/BusinessShell.tsx`, `app.config.ts` (plugins, permissions),
`package.json`/`package-lock.json` (new dependencies: install with `npx expo install`, commit the lockfile alone if
you can), `jest.setup.ts`, `tsconfig.json` (`paths` for packages the shared code uses), and anything in
`frontend/src/lib` (it's the website's code: its checks must stay green, see below).

## How to add a screen

1. Build it in `src/features/<area>/MyThingScreen.tsx` (and its components and pure helpers next to it).
2. Point the route at it: `app/…/my-thing.tsx` is `export { MyThingScreen as default } from …` or a one-line wrapper.
   New detail screens go inside the section's folder (`app/dashboard/[slug]/bookings/[id].tsx`), which already has a
   stack (`_layout.tsx` with `BusinessStack` or the customer tab's stack).
3. Set the header from the screen: `<Stack.Screen options={{ title, headerLargeTitle: true }} />` (large titles on a
   tab's first screen only).
4. Navigate with typed routes: `router.push(\`/dashboard/${slug}/bookings/${id}\`)`, `<Link href=…>`, or
`router.push({ pathname: "/assistant", params: { business: slug } })`.
5. Business screens: read the business with `useBusinessContext()`, permissions with `usePermissions()` and words with
   `useVocabulary()` (all `@shared/…`, provided by the shell). Guard role-restricted screens with
   `<RequireRole min="admin">`; hide actions with `can("admin")`. The backend enforces the same rules.
6. A new top-level destination: route folder + an entry in `src/shell/nav.ts` (+ its test).
7. Modals: a route registered in `app/_layout.tsx` with `presentation: "modal"`; a quick choice or confirmation:
   `<Sheet>`.

## Data: use the shared hooks

All server data goes through the website's React Query hooks: `import { useMyBookings } from
"@shared/api/hooks/use-me"`, `useBookings`, `useCustomers`, `useOverview`… (one file per area in
`frontend/src/lib/api/hooks/`). They own query keys and cache invalidation; mutations update the same caches the
website does. Never call `fetch` (ESLint bans it): if an endpoint has no hook yet, add it to the website's
`lib/api/<area>.ts` + `lib/api/hooks/use-<area>.ts` (with its website test), so both apps get it.

- Loading → `<Skeleton>` in the shape of the content; error → `<ErrorState error onRetry>`; empty → `<EmptyState>`
  with the next step. Show cached data while refetching (the persisted cache makes this the normal case).
- Lists: `FlashList` with `usePullToRefresh(query.refetch)` and `useRefetchOnFocus(query.refetch)`.
- Dates and money: `@shared/format` (`formatTimeRange(start, end, booking.timezone)`): always in the business's
  timezone, never the phone's. Statuses: `BOOKING_STATUS` / `PAYMENT_STATUS` from `@shared/status` with `<Badge>`.
- Persisted cache: everything persists (encrypted) unless the query has `meta: { persist: false }`.
- Pages that stay on the web: `openWebsite("/legal/privacy")` from `~/lib/links` (an in-app browser sheet);
  website areas that reach Billing (the dashboard, e.g. the site editor) only in the system browser with
  `openWebsiteInBrowser` (App Store 3.1.1); Stripe flows use `WebBrowser.openAuthSessionAsync` with a return URL into
  the app (scheme in `app.config.ts`).
- Screens that need an account: the root stack's `Stack.Protected` for modals; routes opened from links wrap their
  layout in `RequireSignIn` (`~/auth/RequireSignIn`), which goes through sign-in and back. Explore, a business and
  the booking flow work signed out: don't call authenticated hooks there without `enabled: isSignedIn`.

## Design system (`~/ui`)

Tokens (`src/ui/tokens.ts`) mirror the website's `globals.css`: colours (light and dark), the `space` scale (Tailwind
steps: `space[4]` = 16), radii, Figtree type scale, `MIN_TOUCH` (44), `WIDE_BREAKPOINT` (700). Read colours through
`useTheme().colors`; `<BrandScope color={business.branding.primaryColor}>` re-brands a subtree in a business's
colour (contrast-checked with the website's `brandPalette`) where the website does (their booking, their page).

Primitives: `Text` (variants title1…caption, tones, `numeric`), `Button`, `IconButton`, `Card`, `ListRow`, `Badge`,
`Divider`, `EmptyState`, `ErrorState`, `Skeleton`, `TextField`, `Select`, `Switch`, `Checkbox`, `Sheet`, `useToast`,
`SegmentedControl`, `BusinessAvatar`, `DateTile`, `Screen`, `ScreenScroll`, `SplitView`, `Icon` (lucide icons from
`lucide-react-native`, the website's set). `npm run lint:tokens` rejects raw colours, spacing numbers, font families
and weights outside the token file (escape hatch: `// design-tokens-allow: <reason>`). ESLint rejects React Native's
`Text`, `TextInput`, `Switch` and `Button` outside `src/ui`.

## iPad and large screens

- `useLayout().isWide` (window ≥ 700pt) follows the **window**, not the device: iPad Split View and Slide Over can
  make it a phone layout at any time, and it changes live. Never branch on `Platform.isPad`.
- Wide: sidebar navigation (the shell does it) and, for list → detail screens, `<SplitView list detail>` with the
  selection in state; phones push the detail route instead (see `MyBookingsScreen`). Keep tab state across a resize:
  don't unmount the list when switching modes if you can avoid it.
- Content width: `ScreenScroll` caps at `layout.maxContentWidth`; forms at `layout.formWidth`.
- All orientations are supported (required for iPad multitasking); test portrait and landscape.
- External keyboards: every action reachable by Tab/Space; no hover-only affordances.

## Accessibility checklist (every screen)

- Every control is one accessible element with a role and a name: `Button`/`ListRow`/`Card onPress` do it; icon-only
  controls use `IconButton` with `accessibilityLabel`. Cards read as a sentence (`BookingCard`'s label).
- Titles are headers (`Text` title variants are); state is announced (`accessibilityState` selected / checked /
  disabled / busy); toasts and field errors are announced.
- Dynamic Type: use `Text` (scales with the system size, capped per variant); no fixed heights around text; test at the
  largest accessibility size.
- Touch targets ≥ 44pt (`MIN_TOUCH`); contrast from tokens only (AA); never colour alone (badges have text).
- Reduce Motion: `useReducedMotion()` for anything that moves beyond a fade.
- Test with VoiceOver on a simulator or device before calling a screen done.

## Performance rules

- FlashList for anything that can grow; `keyExtractor`, memoised rows (`memo`) with stable `renderItem`.
- Images via `expo-image` (cached, `transition`), sized boxes.
- React Compiler is on: write plain components; don't add manual `useMemo` noise unless a profiler says so.
- No work in render that reads storage synchronously more than once; MMKV reads are fast, Keychain reads are not
  (cache them, as `dev-session.ts` does).
- Heavy SDKs load only where used (`require` inside the branch, as Clerk is).
- Check a release build (`npx expo run:ios --configuration Release`) for anything that animates or scrolls.

## Tests

`npm test` (Jest + React Native Testing Library). Tests live next to the code as `*.test.ts(x)` (never inside `app/`,
where every file is a route).

```tsx
import { screen, fireEvent } from "@testing-library/react-native";
import { customerBooking } from "@shared/api/__tests__/fixtures/bookings"; // the website's contract-checked fixtures
import { mockApi, calls, apiError } from "~/test/api-mock";
import { renderScreen, renderWithProviders } from "~/test/render";

const api = mockApi((method, path) =>
  path === "/v1/me/bookings" ? { upcoming: [customerBooking], past: [] } : undefined,
);
renderScreen(<MyBookingsList onOpen={jest.fn()} />); // inside an in-memory router (useFocusEffect, router.push work)
expect(await screen.findByTestId("booking-BA-7K3F9Q")).toBeOnTheScreen();
expect(calls(api)).toEqual(["GET /v1/me/bookings"]);
```

- `mockApi` stubs `fetch` only: the real client, hooks and keys run. Unmatched requests answer 404.
- `renderWithProviders` for components without navigation; `renderScreen(ui, { routes })` for screens;
  `renderApp({ signedInAs, initialUrl })` (`src/test/app.tsx`) for whole-app flows on the real routes
  (`src/shell/app-flow.test.tsx`). Large screens: `jest.spyOn(layout, "useLayout")` (see `MyBookingsScreen.test.tsx`).
- Query by role and label first (`getByRole("button", { name })`), `testID` for things without one.
- Coverage thresholds are in `jest.config.js`; raise them as you add tests, never lower them.

**Maestro (E2E on a simulator or device).** Install: `curl -Ls "https://get.maestro.mobile.dev" | bash` (needs Java).
With the backend running and seeded, the dev client installed and Metro running: `npm run test:e2e` (all flows in
`e2e/flows`) or `maestro test e2e/flows/launch-sign-in-home.yaml`. Flows use `testID`s (`id:` in Maestro); sign-in
is the `e2e/subflows/dev-sign-in.yaml` subflow with `ACCOUNT: dev_customer|dev_owner|dev_staff`. `bo-send-message.yaml`
needs the backend with Bo switched on (`ASSISTANT_ENABLED=true AI_FAKE_SCRIPT=demo`). Add a flow for every feature's
main path.

## Definition of done

1. `npm run mobile:check` from the root (format, lint, design tokens, typecheck, tests + coverage, shared-code
   boundary) is green.
2. If you touched `frontend/src/lib` (shared code) or anything else in `frontend/`: the website's checks are green too:
   `npm run frontend:check`, `npm --prefix frontend run build` and `npm --prefix frontend run perf:bundle`.
3. The screen works on the iPhone and iPad simulators against the local backend, in light and dark, at a large text
   size, with VoiceOver; loading, empty and error states seen.
4. A Maestro flow covers the main path; docs updated where behaviour changed (`docs/mobile.md`, this file).
