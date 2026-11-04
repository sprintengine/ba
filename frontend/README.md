# bookanything — frontend

Next.js 16 (App Router, TypeScript strict) · React 19 · Tailwind CSS v4 · Radix · TanStack Query · React Hook Form + Zod · Clerk (or dev auth).

**This file is the handbook.** If you are building a page, read it top to bottom once. The API contract
is `docs/architecture.md` (§6); this frontend implements §3 (auth), §6.9 (types) and §11 (routes).

```bash
npm install
cp .env.example .env.local        # leave Clerk vars empty for dev auth
npm run dev                       # http://localhost:3000  — /dev/ui is the component kitchen sink
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e                  # Playwright (starts `npm run dev` unless E2E_BASE_URL is set)
```

The browser only calls `/api/*`; `next.config.ts` rewrites it to `${BACKEND_ORIGIN}` (default
`http://localhost:8080`). So `apiFetch("/v1/me")` → `http://localhost:8080/v1/me`.

---

## 1. Golden rules

1. **Never hand-roll `fetch` in components.** Data comes from TanStack Query hooks in
   `@/lib/api/hooks` (e.g. `useBookings`, `useCancelBooking`). Raw `fetch` is a lint error outside
   `src/lib/api/client.ts`. If an endpoint or hook is missing, add it to `src/lib/api/<area>.ts` +
   `src/lib/api/hooks/use-<area>.ts` — don't work around it.
2. **Forms = `Form` + `FormField` + react-hook-form + zod.** Map API errors with `applyApiErrors(form, err)`.
3. **Use the component library** (`@/components/ui/*`). Don't restyle primitives inline; if you need a
   new variant, add it to the component's `cva` and it's available everywhere.
4. **Use semantic colour tokens only** (`bg-surface`, `text-muted-foreground`, `border-border`,
   `bg-primary`, `text-brand`, `bg-success-soft`…). Tailwind's default palette is **disabled** —
   `bg-indigo-500` does not exist. Raw ramps (`gray-*`, `iris-*`, `prism-*`) exist but are for the design system itself.
5. **Times are shown in the business timezone**, never the browser's: `formatTime(iso, business.timezone)`.
   Dates are plain `"YYYY-MM-DD"` strings. Money is integer cents: `formatMoney(cents, currency)`.
6. **Never hard-code "customer", "booking", "resource"** in dashboard or public copy — use
   `useVocabulary().v("customers", { title: true })` (a physio's customers are "Patients").
7. **Light and dark must both look right.** Check `/dev/ui` with the theme toggle. Tokens handle it if you follow rule 4.
8. **Accessibility is not optional:** icon-only buttons use `<IconButton label="…">`, controls live inside
   `<Field>`, status is never colour-only (badges have text), respect keyboard focus (all primitives do).

---

## 2. Structure

```
src/
  app/                         routes (App Router) — see §8 for the full map
    (marketing)/               MarketingShell: /, /pricing, /for/[industry], /legal/*
    (auth)/                    AuthShell: /sign-in, /sign-up, /sign-in/done (post-auth router)
    dashboard/                 RequireAuth; /dashboard redirects to first business or /onboarding
      [slug]/layout.tsx        DashboardRoot (components/dashboard/dashboard-root.tsx: loads Me and, at once, the
                               Business by the URL's slug (useBusinessBySlug; by id when that fails) →
                               BusinessContext + vocabulary + booking drawer/sheet) inside DashboardShell + Bo
    onboarding/, my/           RequireAuth + MinimalShell
    [slug]/                    redirects to [slug]/book, the booking portal (PublicBookingShell, styled by
                               branding.portalStyle); with SITES_ENABLED on, the business's site (SiteRenderer) instead
    manage/[token]/            PublicBookingShell (business-branded)
    dev/                       /dev/ui kitchen sink (one file per section in ui/_kitchen-sink), /dev/ui/sites theme
                               gallery, /dev/checkout/[paymentId] (hidden in production)
    globals.css                ALL design tokens (Tailwind v4 @theme)
    providers.tsx              root: Theme + Toaster only
    app-providers.tsx          Auth → Query, mounted by each signed-in/public-booking group's layout (§6)
  components/
    ui/                        the component library (shadcn-style, we own the code)
    shells/                    DashboardShell, MarketingShell, PublicBookingShell, AuthShell, MinimalShell,
                               nav config (dashboard-nav.ts), industries.ts, CommandMenu, UserMenu
    site/                      public site: SiteScope (data-theme), SiteRenderer, section blocks, header/footer,
                               generated art, ThemePicker, ScaledFrame (see §7a)
    dashboard/site/            site editor: state hook, panels, per-section forms, image picker
    assistant/                 Bo: character, launcher, context/provider, panel (home, chat, memory), proposal cards
    ai/                        AI credits meter and running-low notice (shared by every AI surface)
    explore/                   marketplace (§12): ExplorePage, search box, category chips, location picker (city + near me),
                               filters, listing cards, results; ExploreMap is the (unrendered) seam for a map
    offers/                    deals (§12): offers page, editor sheet + affected-times preview, DealPrice, site deals strip
    oauth/                     consent screen, connected apps, the AI assistant help article
    brand/logo.tsx             Logo, LogoMark, Wordmark
    common/                    feedback.tsx (FullPageLoader, ErrorState, NoAccess), theme-toggle.tsx
    <feature>/<entry>.tsx      other features import only a feature's entry points (FEATURE_ENTRY_POINTS in
                               eslint.config.mjs); there are no index.ts barrels
  lib/
    api/                       client.ts, types.ts (§6.9; one file per area in types/), one module per area, query-keys.ts,
                               query-provider.tsx, hooks/ (client-only)
    auth/                      AuthProvider, useAuth, SignedIn/SignedOut, RequireAuth, dev auth
    business/                  business-context (useBusinessContext / useCurrentBusiness / usePermissions),
                               permissions.ts (role ranks and DashboardPermissions: what each role may do)
    format/                    money.ts, datetime.ts (import from "@/lib/format")
    theme/                     color.ts (contrast maths), BusinessThemeProvider, ThemeProvider
    site/                      pure site logic: themes.ts (tokens), section-meta.ts + sections.ts (registry, without
                               and with schemas), schema.ts (zod mirror of the backend), plan-edit.ts (editor transforms), plan.ts, images.ts, seo.ts, fonts.ts
    assistant/                 Bo's pure logic: constants (ASSISTANT_NAME), chat-state reducer, mood, quick actions,
                               rich text; use-assistant-chat (streams a turn into the reducer)
    ai/                        credits helpers (format, tone, percent)
    availability/              pure: opening windows (windows.ts, mirrors SlotEngine) and the weekly-hours editor model
    hooks/                     small shared React hooks (useDebouncedValue, useMounted, useNow, useReducedMotion, useIdleMount, …)
    explore/                   pure: URL filter state (Zod), query mapping, category icon registry, formatting, SEO
    offers/                    pure: offer form schema (Zod), form ↔ OfferInput, preview input, display helpers
    resources/                 pure: resource form schema (Zod), Resource ↔ form values ↔ ResourceInput, colour swatches
    services/                  pure: service form schema (Zod), Service ↔ form values ↔ ServiceInput, price/duration ranges
    settings/                  pure: Settings forms (general, policies, customer groups, questions): Zod schemas, value mapping
    oauth/                     pure: authorize query parsing (Zod), app URL, formatting
    booking/                   pure booking logic: flow URL state, steps, selection, request, quote.ts (price, payment
                               split, "from €45"/duration labels for any service-like shape), day periods, date windows,
                               details schema + session storage, errors → alerts, copy, manage-page hero, calendar links
    onboarding/                pure: the setup draft (create/export), its reducer (one handler map per entity in
                               reducers/), opening-hours edits, validation mirroring SetupInstaller, problem labels
    catalog/                   fixed option lists + labels shared by onboarding and the dashboard: payment modes,
                               location types, resource and question kinds, currencies
    validation/limits.ts       field limits the backend enforces (business, policies, groups, resources, services,
                               questions), each naming the backend rule it mirrors
    slug.ts                    business web address rules (mirrors ReservedSlugs: slugify, slugProblem)
    vocabulary.tsx             VocabularyProvider, useVocabulary, vocab()
    status.ts                  booking/payment status labels + tones, status predicates (isBlockingStatus, isReleasedStatus)
    reserved-slugs.ts          mirrors backend ReservedSlugs
  proxy.ts                     Next 16 "proxy" (was middleware): installs clerkMiddleware when Clerk is configured
tests/e2e/                     Playwright smoke tests
```

---

## 3. Design tokens (`src/app/globals.css`)

**Brand: Prism.** One typeface, graphite ink, one accent and a spectrum of light. The brand book, logo files and
the token source live in the brand kit (`bookanything-brand/prism-kit/`); `globals.css` carries the same values.

**Palette.** Cool graphite greys and one accent, **Iris**, a deep violet (`iris-600` = `#5b4ae0`, white text on it
and it as text both keep 4.5:1). In the app, the **primary action is ink** (near-black in light, near-white in dark)
like Linear/Vercel; iris is the *brand* accent: focus rings, active nav icons, links, highlights, marketing CTAs
(`variant="brand"`). The **prism spectrum** (`prism-cyan`, `prism-lilac`, `prism-peach`, `--prism-gradient`,
`--prism-rim`) is decorative light only: rims, refractions, a lit slot. Never text, never a fill behind text.

**Glass.** Three recipes as utilities: `glass-surface` (cards floating over imagery), `glass-chrome` (nav, top bars)
and `glass-overlay` (dialogs, sheets, popovers). Glass needs something behind it to read as glass; on a flat page use
a solid surface. `text-prism` is for the muted second line of a display headline only.

| Token (utility) | Use |
|---|---|
| `background` | page background (cool off-white / graphite near-black) |
| `surface` / `surface-raised` / `surface-sunken` | cards / popovers & dialogs / wells, sidebar, table headers |
| `muted`, `accent` | subtle fills; hover backgrounds |
| `foreground`, `muted-foreground`, `subtle-foreground` | text: primary / secondary / tertiary |
| `border`, `border-subtle`, `border-strong`, `input` | hairlines; inner dividers; hover borders; input borders |
| `primary` (+`-hover`, `-foreground`) | the main action. **Becomes the business colour inside `BusinessThemeProvider`.** |
| `brand` (+`-hover`, `-foreground`, `-soft`, `-soft-foreground`, `-border`) | accent; also business colour on public pages |
| `success` / `warning` / `danger` / `info` (+`-soft`, `-soft-foreground`, `-border`, `-foreground`) | semantic states. Soft = tinted bg + readable text (badges, alerts) |
| `ring` | focus rings (always visible on keyboard focus) |
| `highlight` (+`-fill`, `-foreground`, `-soft`, `-soft-foreground`) | a second accent for decoration; = brand in the app, the palette's accent on sites |
| `chart-1`…`chart-7`, `chart-grid`, `chart-axis` | charts (see below) |

**Type.** Figtree, the one typeface, self-hosted with `next/font/local` (`app/fonts/Figtree.woff2`); `font-mono`
is Figtree too, so codes and URLs use `tnum` rather than a second family. (Site themes bring their own fonts for
businesses' pages; that is their brand, not ours.) Scale: `text-2xs` 11 · `xs` 12 · `sm` 14 (default UI)
· `base` 16 (body, and inputs on mobile to avoid iOS zoom) · `lg` · `xl` · `2xl` (page titles) · `3xl`/`4xl`
· `display-sm` / `display` / `display-lg` / `display-xl` (marketing). Headings: `font-semibold tracking-tight`.
Add **`tnum`** (tabular numerals) to times, prices, counts in tables.

**Radii.** `rounded-md` (10px) small controls · `rounded-lg` (12px) inputs · `rounded-xl` (14px)
cards, tables · `rounded-2xl` dialogs/sheets. Buttons use `rounded-button(-sm/-lg)` and site images `rounded-image`
so site themes can reshape them (pill, square). **Shadows** are subtle and layered: `shadow-xs` (cards,
inputs), `shadow-sm`, `shadow-md` (hover lift), `shadow-lg` (popovers), `shadow-xl` (dialogs),
`shadow-button` (solid buttons: inner highlight + drop). Dark mode swaps them for deeper blacks.

**Motion.** Fast and quiet. Default transition 150ms `ease-out` (`cubic-bezier(.22,1,.36,1)`).
Keyframe utilities: `animate-fade-in/out`, `animate-pop-in/out` (popovers, 180ms), `animate-dialog-in/out`,
`animate-sheet-in-right/left`, `animate-rise` (content entering), `animate-shimmer` (skeletons).
Use `motion` for layout animation, as `m.*` from `motion/react-m` inside `<LazyMotionFeatures>` (`ui/lazy-motion`; see
`SegmentedControl`), so motion's features load after the page rather than in its first load; a plain fade or slide is
a CSS transition (see `marketing/reveal`). Read the preference with `useReducedMotion` from `lib/hooks`, not motion's
hook. `prefers-reduced-motion` is honoured globally.

**Dark mode.** `next-themes`, class strategy, defaults to system. `<ThemeToggle />` (Light/System/Dark)
or `useTheme()`. Use `dark:` only for rare exceptions — tokens already switch. `data-mode="light|dark"` on an element
forces a mode for that subtree (the site editor previews both); the `dark:` variant honours it.

**Charts (Recharts).** Series colours are `var(--chart-1)` … `var(--chart-7)` **in that fixed order**
(validated for colour-blind separation in both modes; don't reorder, don't cycle — fold extras into
"Other"). For scatter/all-pairs charts use at most 3 series. Chart-4/5 are below 3:1 on white → show
direct labels or a table view. Never dual-axis; grid lines `var(--chart-grid)`, axes `var(--chart-axis)`,
text uses text tokens, not series colours. Every chart gets a table alternative.

---

## 4. Components (`@/components/ui/*`)

All are accessible (Radix under the hood), themeable, dark-mode ready, and take `className` (merged with
`cn()`, later classes win). React 19: `ref` is a normal prop — no `forwardRef`.

| Component | Notes |
|---|---|
| `Button` | `variant`: `primary` (one per surface) · `brand` · `secondary` (default) · `soft` · `ghost` · `danger` · `danger-soft` · `link`. `size`: xs sm md lg xl. `loading`, `block`, `asChild` (wrap `<Link>`). |
| `IconButton` | icon-only; **`label` required** (aria-label + tooltip). |
| `Input` | `leading` / `trailing` adornments, `size` sm/md/lg. |
| `Textarea` | auto-grows (CSS `field-sizing`). |
| `Select` + `SelectTrigger/Value/Content/Item/Group/Label/Separator` | Radix. Values must be non-empty strings. |
| `Combobox` | searchable select: `options={[{value,label,hint,icon}]}`; async via `onSearchChange` + `shouldFilter={false}`; `footer` slot. |
| `Checkbox`, `CheckboxItem` | `CheckboxItem` has label + description. Supports `"indeterminate"`. |
| `Switch` | `size` sm/md. Put in `<Field orientation="horizontal">` for settings rows. |
| `RadioGroup` + `RadioItem`; `RadioCards` + `RadioCard` | cards take `title`, `description`, `icon`, `aside` (e.g. price). |
| `Field`, `Label` | label + help + error; auto-wires `id`, `aria-describedby`, `aria-invalid`, `required` into any child control. |
| `Form`, `FormField`, `FormRootError`, `FormSubmit`, `applyApiErrors` | react-hook-form integration (§5). |
| `Card` + `CardHeader/Title/Description/Action/Content/Footer` | `interactive` for hover lift. |
| `Badge` | `tone`: neutral brand success warning danger info outline solid; `dot`. |
| `BookingStatusBadge`, `PaymentStatusBadge` | from `src/lib/status.ts`. |
| `Avatar`, `AvatarGroup` | initials fallback with deterministic tint; `shape="square"` for businesses. |
| `Tooltip` | `<Tooltip content="…" shortcut="⌘K">child</Tooltip>`. Brings its own provider; the dashboard layout mounts one `TooltipProvider` so its tooltips share the skip delay. |
| `Popover`, `DropdownMenu*` | menu items support icons, `destructive`, checkbox/radio items, sub-menus, shortcuts. |
| `Dialog*` (`size` sm/md/lg/xl; `DialogHeader/Body/Footer`), `ConfirmDialog` | ConfirmDialog: `onConfirm` may return a promise (spinner until done), `destructive`. |
| `Sheet*` (side panel, left/right, sizes) · `Drawer*` (vaul bottom sheet for mobile) | booking detail → Sheet on desktop, Drawer on mobile. |
| `Tabs` (`TabsList variant="underline" \| "pill"`) · `SegmentedControl` | segmented has a sliding indicator. |
| `TableContainer`, `Table*`, `TableHead sort/onSort/align`, `TableCell align="right"`, `TableRow interactive` | right-aligned cells get `tnum`. |
| `Skeleton`, `SkeletonText`, `Spinner`, `EmptyState` | skeletons should match the real layout. |
| `toast` (sonner) | `toast.success/error/warning/promise`. `<Toaster/>` is global. |
| `Calendar` | month grid on **plain dates**; `min/max`, `isDateDisabled`, `hasMarker` (dot), `timeZone` (for "today"), `size="lg"` for public booking. Full keyboard support. |
| `DatePicker` | button + popover Calendar; value `"YYYY-MM-DD" \| null`. |
| `TimeInput` | `"HH:mm"`; lenient typing ("930", "2pm"); ↑/↓ steps. |
| `MoneyInput` | value in **cents**; `currency` from the business. |
| `NumberInput` | `number \| null` (empty = null). `mode`: `integer` (default; digits only) · `decimal` (signed, `.` or `,`; other keys rejected). `min`/`max` clamp on blur, `unit` suffix. |
| `ColorPicker` | curated swatches + hex + native picker, live contrast preview. |
| `Command*`, `CommandDialog` | cmdk. The dashboard ⌘K palette is `components/shells/command-menu.tsx` — add global actions there. |
| `PageHeader` (`title, description, actions, back, eyebrow, children`), `SectionHeader` | every page starts with a `PageHeader`. |
| `PageContainer` (`size`: narrow · default · wide · full) | width container for dashboard pages (`wide` for tables, `full` for the calendar). |
| `StatCard` | KPI tile: `label, value, delta {value, trend, positiveIsGood}, hint, icon, loading`. |
| `Separator`, `ScrollArea`, `Kbd` | |

Feedback helpers (`@/components/common/feedback`): `ErrorState` (shows the API message, "can't reach" copy when the
backend is down, retry), `NoAccess` (403/404), `FullPageLoader`.

---

## 5. Data: API layer and hooks

- `src/lib/api/types.ts` — every type from architecture §6.9, exact field names, defined per area in
  `src/lib/api/types/<area>.ts` (bookings, services, site, offers…) and re-exported. Import with
  `import type { … } from "@/lib/api/types"`; add a new type to its area file.
- `src/lib/api/<area>.ts` — one object per area with a function per endpoint:
  `publicApi, meApi, onboardingApi, businessApi, resourcesApi, servicesApi, bookingsApi, customersApi,
  teamApi, reportsApi, auditApi, paymentsApi, billingApi`. Business-scoped functions take `businessId` first.
- `src/lib/api/client.ts` — `apiFetch`, `ApiError { status, code, message, fields, isNotFound, isForbidden,
  isUnauthenticated, isUnavailable }`, `errorMessage(err)`, `newIdempotencyKey()`. The bearer token is
  injected automatically from the auth layer. GETs time out after 15 s (`timeoutMs`; writes and streams have no
  default) as a `NETWORK_ERROR`; a caller's own abort is rethrown as is. Query functions that may be superseded
  (availability windows, searches) pass TanStack's `signal` through.
- `src/lib/api/query-keys.ts` — `qk`. Every business key starts `["business", id, …]`, so
  `queryClient.invalidateQueries({ queryKey: qk.business(id).root() })` refreshes everything for a business.
- **Hooks (`@/lib/api/hooks`)** — use these in components:
  - Queries `use<Thing>(…, options?)`: `useMe`, `useMyBookings`, `useBusiness`, `useOverview`, `useServices`,
    `useResources`, `useResourceAvailability`, `useClosures`, `useCustomerGroups`, `useQuestions`,
    `useBookings` (from/to, no paging — calendar), `useInfiniteBookings`, `useBooking`, `useStaffAvailability`,
    `useCustomers`/`useInfiniteCustomers`, `useCustomer`, `useTeam`, `useReportSummary`,
    `usePaymentsStatus`, `useBilling`, public: `usePublicBusiness`, `usePublicServices`,
    `usePublicAvailabilityWindows`, `useManagedBooking`, `useTemplates`, `useTemplate`,
    `useSlugAvailability`, `useDevPayment`. Site (§15): `useSiteState`, `useSiteVersions`,
    `useStockSearch`; mutations `useSaveSite` (`{plan, baseVersion}`), `usePublishSite`, `useRestoreSiteVersion`,
    `useGenerateSite`, `useEditSite`, `useTrackStockDownload`, `useUploadImage` (a `File`, sent as multipart).
    AI (§16-17): `useAiUsage`, `useAssistantState`, `useAssistantThread`, `useAssistantMemory`; mutations
    `useCreateThread`, `useConfirmAction` (refreshes the whole business, its public pages and listings),
    `useRejectAction`, `useDismissNudge`, `useAddMemory`, `useUpdateMemory`, `useDeleteMemory`. Sending a message is a
    stream, not a mutation: `assistantApi.send` (an async generator of Zod-validated `TurnEvent`s over
    `apiStream`, the SSE reader in `client.ts`), driven by `useAssistantChat` in `lib/assistant`. Rescheduling: `useStaffAvailability` with `excludeBookingId`,
    `useManagedAvailabilityWindows`, `useMyBookingAvailabilityWindows` (never the public availability — it counts the
    booking's own time as busy and ignores its customer group).
    Marketplace (§12): `useMarketplaceMeta`, `useMarketplaceSearch` (infinite, cursor), `useMarketplaceSettings`,
    `useUpdateMarketplaceSettings`. Deals: `useOffers`, `useOfferPreview` (pass `null` while the draft is invalid),
    `usePublicOffers`, `useCreateOffer`, `useUpdateOffer`, `usePauseOffer`, `useResumeOffer`, `useDeleteOffer`.
    OAuth: `useAuthorizeCheck`, `useAuthorizeDecision`, `useConnectedApps`, `useRevokeConnectedApp`.
  - Mutations `use<Verb><Thing>`: e.g. `useCreateBooking`, `useCancelBooking`, `useRescheduleBooking`,
    `useApproveBooking`, `useDeclineBooking` (`{ id, reason? }`), `useSendPaymentLink`, `usePayMyBooking`, `useSetBookingStatus`, `useReplaceService`, `useReplaceResourceRules`,
    `useCreateResourceOverride`, `useInviteTeamMember`, `useEraseCustomer`, `useUpdateBusiness`,
    `useCreatePublicBooking`, `useCancelMyBooking`, `useConnectPayments`, `useBillingCheckout`… Variables:
    create → the input; update/action → `{ id, input }`; delete/approve → the id. Mutations update and
    invalidate the right caches **and await the refetch**, so `isPending` covers it.
  - Business-scoped hooks take `businessId` first and are disabled until it's truthy.

```tsx
"use client";
const business = useCurrentBusiness();
const bookings = useInfiniteBookings(business.id, { status: ["confirmed", "pending_approval"], from, to });
const cancel = useCancelBooking(business.id);

if (bookings.isPending) return <TableSkeleton />;
if (bookings.isError) return <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} />;

await cancel.mutateAsync({ id, input: { reason, refund: "policy", notifyCustomer: true } });
toast.success("Booking cancelled");
```

**Idempotency.** For booking creation, create the key **once per submit intent** and reuse it on retries:
`const key = useRef(newIdempotencyKey())` → `create.mutate({ body, idempotencyKey: key.current })`; make a
new key only after success or when the user changes the booking.

**Errors.** Show `errorMessage(err)` (the backend's human message). Special codes worth handling with bespoke
UI: `SLOT_UNAVAILABLE` (refresh slots), `PLAN_LIMIT_REACHED` (upgrade prompt), `PAYMENTS_NOT_CONFIGURED`,
`POLICY_VIOLATION`, `SLUG_TAKEN`, `RATE_LIMITED`, `AI_LIMIT_REACHED` (the business's monthly AI credits are used;
show `CreditsNotice` / a link to Settings → Billing for owners), `AI_NOT_CONFIGURED` (no AI model: Bo's degraded mode),
`UPLOADS_NOT_CONFIGURED`. `ApiError.fields` → `applyApiErrors(form, err)`.

**Forms.**
```tsx
const schema = z.object({ name: z.string().trim().min(1, "Enter a name"), email: z.email().nullable() });
const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: "", email: null } });
const create = useCreateCustomer(business.id);

<Form form={form} onSubmit={async (values) => {
  try { await create.mutateAsync({ ...values, phone: null }); toast.success("Customer added"); }
  catch (err) { applyApiErrors(form, err); }
}}>
  <FormField name="name" label="Name" required>{(field) => <Input {...field} />}</FormField>
  <FormField name="email" label="Email" optional>
    {(field) => <Input type="email" {...field} value={field.value ?? ""} />}
  </FormField>
  <FormRootError />
  <FormSubmit>Add customer</FormSubmit>
</Form>
```
Non-text controls: `{(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}`,
`<MoneyInput value={field.value} onValueChange={field.onChange} currency={business.currency} />`.

**Formatting (`@/lib/format`).** `formatMoney(cents, currency, { exact?, signed? })` ("€45", "€45.50"),
`formatPrice` ("Free" for 0), `parseMoney`, `formatTime(iso, tz)`, `formatTimeRange`, `formatDate(value, tz,
style)` (styles: short, dayMonth, medium, dayMonthYear, long, full, weekday, monthYear), `formatDateTime`,
`formatRelativeDay` (Today/Tomorrow), `formatDuration(min)`, `todayInTz(tz)`, `toPlainDate(iso, tz)`,
`zonedToIso(date, "09:00", tz)` (for `start` fields), `addDaysToPlainDate`, `isoWeekday` (Mon=1 like
`AvailabilityRule.dayOfWeek`), `parseTimeInput`, `timeZoneLabel`. Default locale `DEFAULT_LOCALE` (`en-IE`); pass `business.locale`.

---

## 6. Auth (`@/lib/auth`)

One interface for both modes:
```ts
const { isLoaded, isSignedIn, user, getToken, signOut, mode } = useAuth();
<SignedIn>…</SignedIn>  <SignedOut>…</SignedOut>  <RequireAuth fallback={…}>…</RequireAuth>
```
- **Clerk mode** — when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (+ `CLERK_SECRET_KEY`) are set. `/sign-in`,
  `/sign-up` render Clerk's components styled with our tokens (`clerkAppearance` in
  `clerk-auth-provider.tsx`). The `/dashboard`, `/onboarding` and `/my` layouts
  call `protectRoute()` (`@/lib/auth/server`, Clerk's `auth.protect()`) server-side; `src/proxy.ts` only installs
  `clerkMiddleware`, pointed at our `/sign-in` and `/sign-up` so a signed-out visitor lands there with the page they
  wanted as an absolute `redirect_url` (`safeRedirectPath` takes the path of a URL on our own origin).
  (Clerk Core 3 removed `<SignedIn>`/`<SignedOut>`; use ours.)
- **Dev mode** — otherwise. Token `dev.<base64url({"sub","email","name"})>` in `localStorage`
  (`bookanything.devAuth`). `/sign-in` has an email + name form and quick picks for
  `owner@bookanything.test` (`dev_owner`), `staff@bookanything.test` (`dev_staff`),
  `customer@bookanything.test` (`dev_customer`) matching the backend demo seed. The backend must run
  `AUTH_MODE=dev`, `APP_ENV=development`. Routes are guarded client-side by `<RequireAuth>`.
- **After sign-in** everything goes through `/sign-in/done?redirect_url=…`: it calls `/v1/me` (which links
  guest bookings and accepts invitations), then goes to `redirect_url` if safe, else members → `/dashboard`
  (→ first business), customers who have booked → `/my/bookings`, others → `/onboarding` (`accountHomePath`;
  `/dashboard` without a membership goes the same way). A sign-up without a `redirect_url` comes with
  `intent=sign-up` and goes to `/onboarding`, or to `/dashboard` when the account is already a member's.
- To send someone to sign in: `router.push(signInUrl(pathname))`.
- `useAuth().user.id` is the Clerk/dev subject, **not** our DB user id — use `useMe().data.user.id`.
- **Where the providers are.** Clerk is ~70 KB gzip, so the root layout mounts only the theme and the toasts.
  `AppProviders` (`app/app-providers.tsx`: `AuthProvider` → `QueryProvider`) is mounted by the layouts of `(auth)`,
  `dashboard`, `my`, `onboarding`, `invitations`, `oauth/authorize`, `[slug]`, `manage` and `dev`; Explore mounts
  `PublicQueryProvider` (the query client without auth); the other marketing pages mount neither, and their nav asks
  `useSignedInHint()` (`lib/auth/signed-in-hint.ts`: Clerk's non-httpOnly `__client_uat` cookie is a sign-in time,
  `0` once signed out; in dev mode the localStorage token). It is a hint: a stale one only sends someone to
  `/dashboard`, whose guard sends them to sign-in. A new top-level route must be added to
  `app/__tests__/providers-placement.test.ts`, which records which groups mount what; a page outside `AppProviders`
  that calls `useAuth()` or a query hook throws.
- The query client is one per browser session (shared by every group's provider, so moving from `/my` to
  `/dashboard` keeps the cache) and one per request on the server. The cache is cleared when the signed-in user
  changes, also when it changed while no provider was mounted (signed out on a marketing page).
- The root `error.tsx` is the last-resort boundary on every page, so it stays light (no API client or auth helpers);
  failed requests are shown in place with `ErrorState`.

---

## 7. Theming

- **App/dashboard:** bookanything tokens. **Public pages:** `PublicBookingShell` wraps content in
  `BusinessThemeProvider primaryColor={business.branding.primaryColor}`, which computes contrast-safe
  `--primary/--brand/--ring` for light and dark (`src/lib/theme/color.ts`, tested with nasty colours).
  So on `/[slug]`, `<Button variant="primary">`, selected calendar days, focus rings and `bg-brand-soft`
  all become the business colour automatically. Use `BusinessThemeProvider` for previews too (e.g. branding settings).
- Business tiles/avatars: `<BusinessTile name logoUrl color size />`.

### 7a. Sites and themes (architecture §15)

- **Never write site HTML.** A site is a typed `SitePlan` (theme, palette, SEO, ordered sections); `SiteRenderer`
  renders it with the design system. The AI and the editor only ever change the plan.
- **Themes** (`lib/site/themes.ts`, one token file per theme in `lib/site/themes/`): clinical, calm, bold, playful,
  editorial, minimal. Each is a token set (light and
  dark surfaces and text, radius scale, button/image radius, section spacing, heading font/weight/case) plus structural
  choices (header, image treatment, card style, services layout, eyebrow). `SiteScope` applies it as CSS variables on
  a `data-theme` element; `globals.css` maps `--tl-*`/`--td-*` onto the semantic tokens, so every component inside
  (including the booking flow at `/[slug]/book`) follows the theme. The palette's primary and accent colours are
  computed against the theme's own surfaces for contrast (`themes.test.ts` checks every theme against awkward colours).
- **Fonts** come from a small `next/font` allowlist (`lib/site/fonts.ts`, not preloaded; only the theme's files load).
  Use `site-heading` (theme font, weight, tracking, case) for site headings and `font-heading`/`font-body` elsewhere.
- **Sections** are a registry in three typed parts: `lib/site/section-meta.ts` (label, defaults, "has content"; no
  zod, so the public site ships without it) extended by `lib/site/sections.ts` (the zod schema mirroring the backend,
  for the editor and plan validation), `components/site/section-renderers.tsx` (the block) and
  `components/dashboard/site/section-editors.tsx` (icon, form, summary). Adding a section type = one entry in each
  (TypeScript fails until all three exist) plus the backend registry.
- **Live data only.** Services, prices, durations, team and hours come from the business, never the plan; blocks
  hide themselves publicly when empty and show a hint in the editor preview (`mode="preview"`).
- **Container queries.** Blocks use `@sm:`…`@7xl:` against the `site` container, never viewport breakpoints, so the
  editor renders real mobile (390px) and desktop (1280px, zoomed with `ScaledFrame`) layouts side by side.
- **Images**: `SiteMedia`/`SiteImageFill` render uploads, Unsplash photos (with the required credit) or a
  `GeneratedArt` pattern drawn from the palette. Use `ImagePicker` (upload / stock / generated) in forms and
  `ImageUploadDropzone` for plain uploads (logo, cover).

### 7b. Bo, the assistant (architecture §17)

- **Off by default.** Only where the business says the deployment offers it (`Business.assistantAvailable`: the
  backend's `ASSISTANT_ENABLED` and a model); otherwise the layout mounts none of it (no launcher, panel, ⌘J, ⌘K "Ask
  Bo…", nudges, or Bo in Billing's AI credits, which are hidden when nothing else uses them either). The public pages
  follow `NEXT_PUBLIC_ASSISTANT_ENABLED` (`assistantMarketed()`, `lib/assistant/flag.ts`) and, off, tell owners to
  connect their own AI assistant to the business MCP instead.
- **Dashboard only.** `AssistantProvider` wraps the dashboard layout; `DashboardShell` places the `floating` launcher
  bottom-left of the content and adds ⌘K "Ask Bo…" (`onAskAssistant`). ⌘J toggles the panel. The name is
  `ASSISTANT_NAME` (`lib/assistant/constants.ts`); never write "Bo" in copy.
- **Character**: `<BoCharacter mood size labelled? />`, moods `idle | listening | thinking | success | error |
  attention` derived by `boMood()` from the chat state. It only sets `data-mood` / `data-motion`; the animation lives
  in `globals.css` (`.bo …`) and stops under reduced motion. Colours come from `--bo-*` variables (monochrome and inverse to the
  surface, a brand character like the logo), so it reads the same in light and dark. `/dev/ui/bo` shows every mood.
- **Panel**: `ResponsivePanel` (sheet on desktop, drawer on phones) with home (nudges, quick actions, recent chats),
  chat (`role="log"` live region, tool chips, `ProposalCard`s, notices) and memory. Proposals never run until the
  member clicks the confirm button; the card then shows the result and links (dashboard-relative paths).
- **Degraded mode**: without a model the panel still opens with nudges and shortcuts, the composer is disabled and an
  honest "AI isn't configured" notice shows. No fake answers.
- **Credits**: every AI surface shows `CreditsNotice` (running low / used up) and Settings → Billing has the
  `AiUsageCard` (meter, per-feature bars, daily chart with a table view).

---

## 8. Routes and how to add a page

Every route in architecture §11 is built. A new page renders the right shell and a `PageHeader`; keep the
shell/header conventions below.

| Route | File | Shell |
|---|---|---|
| `/`, `/pricing`, `/for/[industry]`, `/legal/*` | `app/(marketing)/…` | MarketingShell (layout) |
| `/sign-in`, `/sign-up`, `/sign-in/done` | `app/(auth)/…` | AuthShell |
| `/onboarding` | `app/onboarding/page.tsx` | MinimalShell + RequireAuth |
| `/my/bookings` | `app/my/bookings/page.tsx` | MinimalShell + RequireAuth |
| `/dashboard` | `app/dashboard/page.tsx` | redirect |
| `/dashboard/[slug]/…` (overview, calendar, bookings, customers, customers/[id], services, resources, team, reports) | `app/dashboard/[slug]/…` | DashboardShell (layout) |
| `/dashboard/[slug]/settings/{general,branding,policies,customer-groups,questions,payments,billing}` | `…/settings/…` | settings layout (section nav, admin-only) |
| `/[slug]` | `app/[slug]/page.tsx` → `components/public/public-site-page.tsx` (flow deep links redirect to `/book`; `?site=draft` for owners) | SiteRenderer |
| `/[slug]/book` | `app/[slug]/book/page.tsx` → `components/public/public-booking-page.tsx` | PublicBookingShell (site theme) |
| `/dashboard/[slug]/site` | `components/dashboard/site/site-editor.tsx` (owner/admin) | DashboardShell |
| `/dev/ui/sites` | theme × section gallery (`?theme=&mode=&slug=` for one full page) | dev only |
| `/dev/ui/bo` | Bo in every mood, light and dark | dev only |
| `/manage/[token]` | `app/manage/[token]/page.tsx` | PublicBookingShell |
| `/dev/checkout/[paymentId]`, `/dev/ui` | `app/dev/…` | dev only |
| `/explore`, `/explore/[city]`, `/explore/[city]/[category]` | `app/(marketing)/explore/…` → `components/explore/explore-page.tsx` (server pages validate city/category and set metadata) | MarketingShell |
| `/dashboard/[slug]/offers` | `components/offers/offers-page.tsx` (owner/admin) | DashboardShell |
| `/dashboard/[slug]/settings/marketplace` | `components/dashboard/settings/marketplace-settings.tsx` | settings layout |
| `/oauth/authorize` | `components/oauth/authorize-page.tsx` (consent; never framed, see `next.config.ts` headers) | centered |
| `/my/connected-apps` | `components/oauth/connected-apps.tsx` | MinimalShell + RequireAuth |
| `/help/ai-assistant` | `components/oauth/help-article.tsx` | MarketingShell |

**Dashboard page recipe:** the `page.tsx` is a server component that only renders the feature component
(`<Suspense><BookingsList /></Suspense>`; `customers/[id]` awaits `params` and passes the id). The feature component
is the client component:
```tsx
"use client";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";

export function CustomersList() {
  const business = useCurrentBusiness();          // Business (id, timezone, currency, vocabulary, myRole…)
  const perms = usePermissions();                 // capabilities: perms.manageCustomerData, perms.manageBilling…; perms.can("admin")
  const { v } = useVocabulary();
  const customers = useInfiniteCustomers(business.id, { q });
  return (
    <PageContainer size="wide">                   {/* narrow | default | wide | full (calendar) */}
      <PageHeader title={v("customers", { title: true })} actions={perms.manageBookings && <Button variant="primary">…</Button>} />
      …
    </PageContainer>
  );
}
```
- The `[slug]` layout (`DashboardRoot`, `useDashboardBootstrap`) already handles loading (skeleton inside the shell), unknown slug / not a member
  (`NoAccess`) and errors. Pages can assume `useBusinessContext()` is populated.
- Nav items and role visibility live in `components/shells/dashboard-nav.ts` (`DASHBOARD_NAV`, `SETTINGS_NAV`).
  Reports and Settings are admin+; Payments/Billing settings are owner-only. The API enforces permissions too —
  hide what users can't do, don't just disable it.
- URL state: put filters/tabs in search params so views are shareable. `?new=1` on `/bookings` = open the
  "New booking" sheet (⌘K uses it).
- Pages using `useSearchParams` must be wrapped in `<Suspense>` (Next requirement for static rendering).
- `/dashboard` pages are server components that render a client feature component (only pages that need hooks, like
  the `settings` redirect, are `"use client"`); metadata titles go in a page or a small server `layout.tsx`
  (`export const metadata`).

**Public page recipe:** fetch with `usePublicBusiness(slug)`; render inside `PublicBookingShell business={…}`
(pass `null` while loading). Mobile first: design at 390px, then widen. Primary actions use `variant="primary"`
(= business colour). Calendar `size="lg"` with `timeZone={business.timezone}`.

**Marketing:** server components by default; the shell reads `INDUSTRIES` from `components/shells/industries.ts`.

---

## 9. Environment (`.env.example`)

| Var | Where | Purpose |
|---|---|---|
| `BACKEND_ORIGIN` | build + server | target of the `/api/*` rewrite, read when `next.config.ts` is built (default `http://localhost:8080`), and of server-side reads (`lib/api/server.ts`), read per request |
| `NEXT_PUBLIC_APP_URL` | both | public origin (metadata, `returnUrl`s) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | both / server | enable Clerk; unset = dev auth |
| `NEXT_PUBLIC_ENABLE_DEV_ROUTES` | build | `true` to expose `/dev/*` in a production build |
| `NEXT_PUBLIC_ASSISTANT_ENABLED` | build | `true` to present Bo on the public pages (set with the backend's `ASSISTANT_ENABLED`; both off by default). Off, they offer connecting your own AI assistant to the business MCP |
| `NEXT_PUBLIC_BUSINESS_MCP_ENABLED` | build | On unless `false` (set with the backend's `BUSINESS_MCP_ENABLED` kill switch): indexes and links the business agents guide |
| `WEBMCP_ORIGIN_TRIAL_TOKEN` | build | Chrome's WebMCP origin-trial token for this origin, sent on `/[slug]/book`; unset = only browsers with WebMCP switched on |
| `APPLE_APP_IDS` | server (runtime) | iOS app IDs whose universal links and sign-in this domain vouches for, comma-separated `TEAMID.bundle.id` (`V266333BR2.ie.bookanything.app`; staging `V266333BR2.ie.bookanything.app.preview`). Served at `/.well-known/apple-app-site-association`; unset = 404 |
| `ANDROID_PACKAGE_NAME` | server (runtime) | Android package for App Links (`ie.bookanything.app`; staging `ie.bookanything.app.preview`). Served at `/.well-known/assetlinks.json` with the fingerprints below; either unset = 404 |
| `ANDROID_SHA256_FINGERPRINTS` | server (runtime) | Comma-separated SHA-256 signing certificate fingerprints (`AA:BB:…`, 32 hex bytes, any case): the upload key's (`eas credentials`) and Play App Signing's (Play Console › App integrity). Malformed entries are dropped |

### Deploying: Cloudflare Workers

The site runs as a Cloudflare Worker built by the OpenNext adapter (`@opennextjs/cloudflare`). The release train builds
it once per environment in each nightly and deploys exactly that build to staging and then production
([`docs/releases.md`](../docs/releases.md)); the accounts and hostnames are [`docs/deployment.md`](../docs/deployment.md).
`npm run build` stays the plain Next.js build (`npm start`, the end-to-end tests).

```bash
npm run cf:build     # next build + the Worker bundle in .open-next/ (reads the env above)
npm run cf:check     # cf:build, then the Worker's size against Workers' limit (CI's Frontend job)
npm run cf:preview   # the bundle in the local Workers runtime on :8787, cache populated like a deploy
```

`wrangler.jsonc` names the Workers, their domains and cache buckets (production at the top level, `--env staging`);
settings are not in it: the train passes `NEXT_PUBLIC_*` and `BACKEND_ORIGIN` to the build, and `BACKEND_ORIGIN`, the
app-link settings and `CLERK_SECRET_KEY` to the Worker (`scripts/release/deploy-site.sh`). For `cf:preview`, put runtime
values in `.dev.vars` (git-ignored), e.g. `BACKEND_ORIGIN=http://localhost:8080`. `playwright.deployed.config.ts` runs
the read-only smoke tests in `tests/deployed/` against a deployed site (`E2E_BASE_URL`), as the train does after each
deploy.

How the app's server features behave on Workers (checked with `cf:preview` against a local backend):

- **`/api/*`, `/mcp`, `/mcp/business` and `/.well-known/oauth-*`** are external rewrites: the Worker fetches the API
  hostname, streaming the response (Bo's server-sent events arrive as they are written). The API hostname must be in the
  same Cloudflare zone, so the API sees the visitor's address in `CF-Connecting-IP` (backend/README.md "Behind a proxy").
- **`proxy.ts`** (Clerk) runs as OpenNext's Node.js middleware, which OpenNext still marks experimental: watch for it
  when upgrading either package.
- **Prerendered pages and the social cards** (`opengraph-image`) are built once and served from the incremental cache, an
  R2 bucket per environment that the deploy fills. The cards read their fonts from disk at build time, which a Worker
  cannot do, so they must stay static (no dynamic params, no request data).
- **`/.well-known/apple-app-site-association` and `assetlinks.json`** read their settings per request from the Worker's
  vars.
- **Images**: `next/image` is not used, so there is no image optimization to configure.
- **Size**: the Worker is about 4.5 MiB gzipped, above the free plan's 3 MiB limit: deploying needs the Workers paid
  plan, whose limit is 10 MiB (`npm run cf:check` fails above it and warns within 1 MiB of it).

---

## 10. Testing

Checks: `npm run format:check`, `lint`, `typecheck`, `test:coverage` (thresholds in `vitest.config.ts`) and
`build`; lint rules, module boundaries and the suppressions file are explained in
[`docs/engineering.md`](../docs/engineering.md).

- Unit/component: Vitest + Testing Library + jsdom (`src/**/*.test.ts(x)`). Existing: API client & endpoints,
  hooks, formatters, colour contrast, auth (tokens, routing, provider), key components (Field wiring,
  Calendar keyboard, MoneyInput, Button), site themes/plan logic/schema (`lib/site/*.test.ts`), every section block
  (`components/site/__tests__`) and the site editor against a stateful fake API
  (`components/dashboard/site/__tests__/fake-site-api.ts`). `next/font/google` is stubbed in tests
  (`src/test/next-font-google.ts`). Add tests next to what you build.
- **Component tests** assert by role and accessible name (`getByRole("button", { name: "Save" })`), never by test id or
  class. Cover loading, empty, error (`role="alert"` / `ErrorState`) and success states, and the keyboard (Tab, Enter,
  Space, Escape, arrows: dialogs trap focus and close on Escape). Dashboard components render with `renderDashboard` and
  a fetch router, `mockApi((method, path, body) => …)`, from `components/dashboard/test/render.tsx`; return
  `json(body, status)` for errors. Pin "now" with `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(…)`
  (Date only, so user-event's timers stay real) and wait with `findBy*`/`waitFor`, never a real delay.
- **Forms**: test the client rules (they mirror `lib/validation/limits.ts`) and the server's: answer a submit with a 400
  `{"error":{"code":"INVALID_REQUEST","message":"…","fields":{"name":"…"}}}` and assert the message is the field's
  accessible description, the control is `aria-invalid` and focused (`applyApiErrors`); fields the form doesn't have go
  to `FormRootError`.
- **Accessibility**: `await expectNoAxeViolations(container)` (`src/test/axe.ts`, axe-core via vitest-axe) fails listing
  each violation's rule, impact and nodes. `color-contrast` (no layout in jsdom) and `region` (components render outside
  the shell's landmarks) are off. Radix portals render outside the container: pass `document.body` while a dialog,
  sheet, popover or select is open. Every page and feature component test should have one; `components/ui/a11y.test.tsx`
  holds the primitives' contract (names, Field wiring, `applyApiErrors`, Dialog focus trap, Select/Tabs keyboard).
- **API contract**: `src/lib/api/__tests__/contract.test.ts` validates typed fixtures (`src/lib/api/__tests__/fixtures/`,
  one complete and one sparse fixture per schema, declared `satisfies <Type>`) against `backend/openapi.yaml` with Ajv,
  every object closed. A field the frontend type has and the spec lacks, a spec field the type lacks, a null the type
  can't hold, or a union that differs from the spec's enum fails with the schema and path. When you change a type in
  `lib/api/types`, update its fixtures; when the test fails, fix whichever side is wrong (the spec only when the backend
  DTO already matches). Reuse the fixtures in tests rather than hand-rolling API objects
  (`import { booking } from "@/lib/api/__tests__/fixtures/bookings"`).
- **Hooks**: mutations are tested for their cache effects (what they write with `setQueryData`, which keys they
  invalidate, optimistic updates and rollback), not just the request. `lib/api/hooks/__tests__/harness.tsx` has
  `stubApi` (a fetch router keyed `"METHOD /path"` that fails on unrouted requests), a client seeded with one query per
  key family and `invalidated()`/`removed()` naming exactly which keys a mutation touched.
- **Shared test helpers** (prefer them to hand-rolled objects): `components/dashboard/test/booking-builders.ts`
  (bookings, details, request helpers), stateful fakes per area (`dashboard/resources/__tests__/fake-resources-api.ts`,
  `dashboard/services/__tests__/fake-services-api.ts`, `dashboard/team/__tests__/fake-team-api.ts`, the site and
  assistant fakes), `components/booking/__tests__/booking-test-utils.tsx` with `navigation-mock.ts` (a `next/navigation`
  mock that follows the real URL), `components/onboarding/__tests__/render.tsx`, and `src/test/must.ts`.
- E2E: Playwright in `tests/e2e`. Browsers: set `PLAYWRIGHT_BROWSERS_PATH` if you keep them outside the default cache.
  The easiest way to run them is the isolated stack (`scripts/e2e-stack.sh up`, then `test`, then `down`; see
  `docs/engineering.md` §11): its backend sets the development-only `RATE_LIMIT_MULTIPLIER`, so repeated runs through
  one address are not rate limited. Against a plain dev backend the public booking limit (20 per 10 minutes per IP)
  stops the suite after about three runs in ten minutes. Specs that book use a throwaway business
  (`journey-helpers.ts`); page-wide checks (`accessibility.spec.ts`, `layout-and-theme.spec.ts`) cover `main-pages.ts`.
- Bo's component tests drive the panel against a stateful fake (`components/assistant/__tests__/fake-assistant-api.ts`)
  whose `Turn` pushes real server-sent events at the test's pace. `assistant.spec.ts` (e2e) needs a backend started with
  `ASSISTANT_ENABLED=true`, a model (`AI_FAKE_SCRIPT=demo`, development only, or a key) and the demo seed; it fails
  without them, so a misconfigured stack can't skip it, and the conversation specs skip unless the model is the fake; `assistant-off.spec.ts` runs only with
  `E2E_ASSISTANT=off` against a backend with Bo off (`scripts/e2e-stack.sh test-assistant-off`); for e2e run a second
  backend with it (e.g. `PORT=8091`) and build the frontend with `BACKEND_ORIGIN` pointing at it.
- Site specs (`site.spec.ts`, `branding-upload.spec.ts`) create a throwaway business per test (owned by a fresh
  dev user, so the demo businesses are untouched) and expect a backend without `ANTHROPIC_API_KEY` (the deterministic
  designer answers AI requests).
- A second `next dev` can't run in the same folder: for a separate e2e server use `npm run build` and
  `npx next start -p 3002` with `E2E_BASE_URL=http://localhost:3002`.
- Marketplace and OAuth specs (`marketplace.spec.ts`, `oauth.spec.ts`) need the demo seed (listings, Gleam and Lumen).
  They add and remove their own deals (named per device project) and intercept the OAuth client's loopback redirect.
- **Performance budgets** (`docs/engineering.md` §1, Performance budgets): `npm run perf:bundle` after a build checks
  each key route's first-load JS/CSS (gzip) against `perf/bundle-baseline.json` (3% or 10 KB of growth allowed);
  `npm run perf:vitals` (Playwright `performance` project, Chromium, one page at a time, against `E2E_BASE_URL`)
  checks LCP, FCP, CLS, TBT, TTFB, JS bytes and requests on an emulated mid-range phone against
  `perf/web-vitals-budget.json`. `PERF_REPORT=perf-report/x` writes a JSON + Markdown report, `PERF_ASSERT=0` only
  measures, `npm run perf:compare -- a.json b.json` diffs two reports. Re-record deliberately with
  `npm run perf:bundle -- --update` / `PERF_UPDATE=1 npm run perf:vitals` and say why in the commit. The pure logic
  (`perf/lib/`) has Vitest tests; the scripts run on Node's type stripping (`.ts` imports, erasable syntax only).
- Before committing: `npm run typecheck && npm run lint && npm test && npm run build`.

## 12. Marketplace, deals and AI assistants

- **`/explore`** (architecture §18): filters live in the URL (`lib/explore/filters.ts`); the city (and category) go in the
  path for shareable SEO pages. Categories come from the API; `lib/explore/category-icons.ts` maps keys to icons with a
  fallback, so a new backend category needs no frontend change. Never show ratings until real reviews exist.
- **Deals** (§19): prices are always the server's. Public availability slots carry `offer`; `DealPrice` renders the
  struck-through original with screen-reader text ("was €50, now €40"). The booking flow's `withSlotOffer` (in
  `lib/booking/quote.ts`) applies the chosen slot's deal to the quote. Staff availability carries `offer` too (staff
  and Bo bookings get deals): the dashboard slot picker labels those times and the new-booking summary shows the deal price.
- **AI assistants** (§20): `next.config.ts` rewrites `/mcp`, `/mcp/business` and `/.well-known/oauth-*` to the API.
  `/oauth/authorize` is the OAuth authorization endpoint: it signs the user in with the normal web login, then shows the consent
  card (for the business server, `audience: business`, it also lists the businesses the app will reach and the user's role at
  each; with none, it says there's nothing to connect). It only ever navigates to a `redirectTo` from the API. Connected apps
  say which server each connection is for. Members' guide: `/help/ai-agents-for-business`; the owner decides in Settings ›
  AI agents who may use agents (`aiAgentsAccess`: off, owners and admins (default), the whole team) and which kinds of
  change go ahead without approval (`aiAgentsAutoApprove`; listed only when `Business.aiAgentsAvailable`). Every other
  change an agent proposes waits at `/dashboard/[slug]/approvals/[id]` (the `approvalUrl` the agent gives the member;
  all of them at `/dashboard/[slug]/approvals`), where the member approves or declines it signed in (§20.8).
- **Notifications** (§22): the bell (`components/notifications/notification-bell.tsx`) in the dashboard sidebar, the phone top
  bar and `/my` pages polls `/v1/me/notifications` every 30 seconds and on focus; `/my/notifications` lists them and the
  email choices. Customers approve their AI assistant's requests at `/my/approvals/[id]` (all at `/my/approvals`) and choose
  what goes ahead without approval on `/my/connected-apps` (§20.9).
- **WebMCP** (agents in the browser): the booking flow registers tools on `document.modelContext`
  (`components/booking/booking-agent-tools.ts`, loaded only where the browser has WebMCP): `get_booking_options`,
  `check_availability`, `select_appointment`, `fill_booking_details`, `get_booking_status` and `confirm_booking`. They
  drive the page through the same URL state and details form as clicks, so the customer watches each step and sees the
  review before anything is booked; `confirm_booking` is marked consequential and only works on the review step, and
  payment stays on the provider's page. The agent's input is checked in `lib/booking/agent.ts`; what it is told
  (sensitive answers never repeated) is `lib/booking/agent-views.ts`. To try it: Chrome with
  `chrome://flags/#enable-webmcp-testing`, or production with `WEBMCP_ORIGIN_TRIAL_TOKEN`.

## 11. Known gaps / next steps

- No i18n yet (copy is en-IE); dates/money already go through Intl with a locale parameter.
- Site sections are not reorderable by keyboard drag (use the section menu's Move up/down).
