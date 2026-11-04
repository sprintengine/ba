// k6 load test of the booking path (docs/simulation.md, "Load tests"): customers browsing availability, booking and
// managing their bookings, ramping up to find where latency and errors break their budgets.
//
//   k6 run load/booking.js                                  # against http://localhost:8098, new businesses
//   BASE_URL=https://api.staging.example.com SLUGS=a,b k6 run load/booking.js
//   PROFILE=smoke k6 run load/booking.js                    # a minute at a few users, to try it out
//
// PROFILE: smoke | ramp (default) | soak. Thresholds fail the run (exit code 99) when broken.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { BASE_URL, EXPECTED, businesses, day, json, serviceOf, uid, warmUp } from "./lib.js";

http.setResponseCallback(EXPECTED);

/**
 * Bookings refused because a business was full for the month: the test then measures refusals, not bookings, so any
 * fails it (raise BUSINESSES, or pass more SLUGS).
 */
const planLimitRefusals = new Counter("plan_limit_refusals");

const PROFILES = {
  // Up within 10 seconds and steady for the rest of the minute, so every scenario runs.
  smoke: {
    browse: [{ duration: "10s", target: 3 }, { duration: "50s", target: 3 }],
    book: [{ duration: "10s", target: 1 }, { duration: "50s", target: 1 }],
    manage: [{ duration: "10s", target: 1 }, { duration: "50s", target: 1 }],
  },
  ramp: {
    browse: [
      { duration: "1m", target: 10 },
      { duration: "3m", target: 50 },
      { duration: "3m", target: 100 },
      { duration: "1m", target: 0 },
    ],
    book: [
      { duration: "1m", target: 2 },
      { duration: "3m", target: 10 },
      { duration: "3m", target: 20 },
      { duration: "1m", target: 0 },
    ],
    manage: [
      { duration: "1m", target: 2 },
      { duration: "3m", target: 8 },
      { duration: "3m", target: 15 },
      { duration: "1m", target: 0 },
    ],
  },
  soak: { browse: [{ duration: "30m", target: 30 }], book: [{ duration: "30m", target: 5 }], manage: [{ duration: "30m", target: 5 }] },
};
const profile = PROFILES[__ENV.PROFILE || "ramp"];
if (!profile) throw new Error(`Unknown PROFILE ${__ENV.PROFILE}: use smoke, ramp or soak`);

const scenario = (exec, stages) => ({ executor: "ramping-vus", exec, startVUs: 0, stages, gracefulRampDown: "30s" });

export const options = {
  scenarios: {
    browse: scenario("browse", profile.browse),
    book: scenario("book", profile.book),
    manage: scenario("manage", profile.manage),
  },
  thresholds: {
    // Errors: 5xx, timeouts and unexpected 4xx (a 409 for a time someone else took is expected, see lib.js).
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    plan_limit_refusals: ["count<1"],
    "http_req_duration{scenario:browse}": ["p(95)<500"],
    "http_req_duration{name:availability}": ["p(95)<600"],
    "http_req_duration{name:book}": ["p(95)<1000"],
    "http_req_duration{scenario:manage}": ["p(95)<800"],
  },
  setupTimeout: "5m",
};

export function setup() {
  const slugs = businesses();
  const targets = slugs.map((slug) => ({ slug, serviceId: serviceOf(slug) }));
  warmUp(targets);
  return { targets };
}

function target(data) {
  return data.targets[Math.floor(Math.random() * data.targets.length)];
}

function availability(t, from, to) {
  const res = http.get(`${BASE_URL}/v1/public/businesses/${t.slug}/availability?serviceId=${t.serviceId}&from=${from}&to=${to}`, {
    tags: { name: "availability" },
  });
  check(res, { "availability 200": (r) => r.status === 200 });
  if (res.status !== 200) return [];
  return res.json("days").flatMap((d) => d.slots);
}

/** A customer looking around: the business, its services, a week of times. */
export function browse(data) {
  const t = target(data);
  const page = http.get(`${BASE_URL}/v1/public/businesses/${t.slug}`, { tags: { name: "business" } });
  check(page, { "business 200": (r) => r.status === 200 });
  http.get(`${BASE_URL}/v1/public/businesses/${t.slug}/services`, { tags: { name: "services" } });
  const start = Math.floor(Math.random() * 21);
  availability(t, day(start), day(start + 6));
  sleep(1 + Math.random() * 2);
}

function bookOnce(t) {
  const slots = availability(t, day(1), day(1 + Math.floor(Math.random() * 30)));
  if (slots.length === 0) return null;
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const id = uid();
  const body = {
    serviceId: t.serviceId,
    optionId: null,
    addonIds: [],
    groupId: null,
    resourceId: null,
    start: slot.start,
    customer: { name: `Load Customer ${id}`, email: `load-${id}@example.test`, phone: null },
    answers: {},
    customerNotes: null,
  };
  const res = http.post(`${BASE_URL}/v1/public/businesses/${t.slug}/bookings`, JSON.stringify(body), json({
    headers: { "Content-Type": "application/json", "Idempotency-Key": `load-${id}` },
    tags: { name: "book" },
  }));
  if (res.status === 409 && res.json("error.code") === "PLAN_LIMIT_REACHED") planLimitRefusals.add(1);
  check(res, { "booked or the time was taken": (r) => r.status === 201 || r.json("error.code") === "SLOT_UNAVAILABLE" });
  return res.status === 201 ? res.json("manageToken") : null;
}

/** A customer booking a time (a 409 when another customer took it is expected). */
export function book(data) {
  bookOnce(target(data));
  sleep(2 + Math.random() * 3);
}

/** A customer who booked looks at it, looks for another time, moves it and then cancels it. */
export function manage(data) {
  const t = target(data);
  const token = bookOnce(t);
  if (!token) return sleep(2);
  const manageUrl = `${BASE_URL}/v1/public/manage/${token}`;
  check(http.get(manageUrl, { tags: { name: "manage" } }), { "manage 200": (r) => r.status === 200 });
  const times = http.get(`${manageUrl}/availability?from=${day(1)}&to=${day(14)}`, { tags: { name: "manage availability" } });
  const slots = times.status === 200 ? times.json("days").flatMap((d) => d.slots) : [];
  if (slots.length > 0) {
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const moved = http.post(`${manageUrl}/reschedule`, JSON.stringify({ start: slot.start }), json({ tags: { name: "reschedule" } }));
    check(moved, { "moved or the time was taken": (r) => r.status === 200 || r.status === 409 });
  }
  const cancelled = http.post(`${manageUrl}/cancel`, JSON.stringify({ reason: "Load test" }), json({ tags: { name: "cancel" } }));
  check(cancelled, { "cancelled 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}
