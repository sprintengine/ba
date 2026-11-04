// Shared helpers for the k6 load tests (docs/simulation.md, "Load tests"). Plain JavaScript for the k6 runtime.
import encoding from "k6/encoding";
import http from "k6/http";
import { fail } from "k6";

/** The API origin, e.g. http://localhost:8098 (no trailing slash). */
export const BASE_URL = (__ENV.BASE_URL || "http://localhost:8098").replace(/\/+$/, "");

/** A 409 (another customer took the time, the plan's limit) is an answer, not a failure of the system under load. */
export const EXPECTED = http.expectedStatuses({ min: 200, max: 299 }, 409);

export function json(body) {
  return { headers: { "Content-Type": "application/json" }, ...body };
}

/** A development-only dev token (`dev.` + base64url JSON), as the backend's dev auth accepts. */
export function devToken(sub, email, name) {
  return `dev.${encoding.b64encode(JSON.stringify({ sub, email, name }), "rawurl")}`;
}

/** `YYYY-MM-DD` [days] from today (UTC). */
export function day(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** A unique-enough token for names, emails and Idempotency-Keys. */
export function uid() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function weekly(open, close) {
  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime: open, endTime: close, audienceGroupKeys: [] }));
}

/**
 * Creates a business to load (development only: onboarding as a dev-token owner). Open all day, every day, with three
 * people and a free 15-minute service, so availability is large and booking never waits on payment. Returns its slug.
 */
export function createBusiness(run, n) {
  const owner = devToken(`dev_load_${run}_${n}`, `load-${run}-${n}@bookanything.test`, `Load Owner ${n}`);
  const person = (key, name) => ({ key, kind: "person", name, description: null, capacity: 1, weeklyHours: weekly("00:00", "23:55") });
  const setup = {
    name: `Load ${run} ${n}`,
    slug: `load-${run}-${n}`,
    industry: "generic",
    description: "A business for load tests.",
    timezone: "Europe/Dublin",
    currency: "EUR",
    locale: "en-IE",
    country: "IE",
    vocabulary: { resource: "Staff member", resources: "Staff", customer: "Customer", customers: "Customers", booking: "Booking", bookings: "Bookings" },
    branding: { primaryColor: "#4f46e5", logoUrl: null, coverImageUrl: null },
    policies: {
      minNoticeMinutes: 0,
      maxAdvanceDays: 60,
      cancellationNoticeHours: 0,
      lateCancellationRefundPercent: 0,
      allowCustomerCancel: true,
      allowCustomerReschedule: true,
      holdMinutes: 5,
      requireCustomerPhone: false,
      nextAvailableOnly: false,
    },
    customerGroups: [],
    resources: [person("a", "Avery"), person("b", "Blake"), person("c", "Casey")],
    services: [
      {
        name: "Quick slot",
        description: null,
        category: "Load",
        color: "#4f46e5",
        durationMinutes: 15,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        slotIntervalMinutes: 15,
        minNoticeMinutes: null,
        maxAdvanceDays: null,
        capacity: 1,
        priceCents: 0,
        paymentMode: "free",
        depositCents: null,
        requiresApproval: false,
        locationType: "business",
        isPublic: true,
        options: [],
        addons: [],
        requirements: [{ label: "Staff", quantity: 1, customerSelectable: false, resourceKeys: ["a", "b", "c"] }],
        allowedGroupKeys: [],
      },
    ],
    questions: [],
  };
  const res = http.post(`${BASE_URL}/v1/businesses`, JSON.stringify(setup), {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
  });
  if (res.status !== 201) fail(`creating a load business answered ${res.status}: ${res.body}`);
  return res.json("slug");
}

/**
 * The businesses to load: SLUGS (comma-separated, e.g. on staging, where dev tokens don't work) or BUSINESSES new ones
 * (default 40). A Free business takes 100 bookings a month (cancelled ones count), and the ramp profile books about
 * 2,000 times, so it needs a few dozen; a refusal for the limit fails the run (see `plan_limit_refusals`).
 */
export function businesses() {
  if (__ENV.SLUGS) return __ENV.SLUGS.split(",").map((s) => s.trim()).filter(Boolean);
  const run = uid().slice(-6);
  const count = Number(__ENV.BUSINESSES || 40);
  return Array.from({ length: count }, (_, i) => createBusiness(run, i + 1));
}

/**
 * Warms the backend up before measuring: a freshly started JVM answers its first requests slowly while it compiles
 * them, which a short run would report as latency. Each business's availability is read a few times over the ranges
 * the scenarios use; tagged `warm-up`, so these requests count towards no threshold.
 */
export function warmUp(targets) {
  for (let round = 0; round < 3; round++) {
    for (const t of targets) {
      for (const days of [6, 30]) {
        http.get(`${BASE_URL}/v1/public/businesses/${t.slug}/availability?serviceId=${t.serviceId}&from=${day(1)}&to=${day(1 + days)}`, {
          tags: { name: "warm-up" },
        });
      }
      http.get(`${BASE_URL}/v1/public/businesses/${t.slug}`, { tags: { name: "warm-up" } });
    }
  }
}

/** The first public service of [slug] that needs no online payment. */
export function serviceOf(slug) {
  const res = http.get(`${BASE_URL}/v1/public/businesses/${slug}/services`, { tags: { name: "services" } });
  const services = res.status === 200 ? res.json() : [];
  const free = services.find((s) => !((s.paymentMode === "full" || s.paymentMode === "deposit") && s.priceCents > 0));
  if (!free) fail(`${slug} has no service bookable without paying online`);
  return free.id;
}
