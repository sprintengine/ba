/**
 * A run: set the world up, then start actions at the configured rate (never more than `--concurrency` at once) until
 * the duration is over, checking the invariants every `--check-every`; then let it settle, check once more and report.
 */
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { publicApi } from "@shared/api/public";
import * as customer from "./actions/customer";
import { memberCapScenario, planLimitScenario } from "./actions/limits";
import * as owner from "./actions/owner";
import * as staff from "./actions/staff";
import { Checker } from "./checker";
import { attempt } from "./http";
import { renderReport, type RunSummary } from "./report";
import type { Rng } from "./rng";
import type { Sim } from "./runtime";
import { todayIn } from "./actions/common";
import { createBusiness, identity } from "./setup";
import type { SimBusiness } from "./shadow";
import { enableOnlinePayments, requestSimulationAccount } from "./stripe";
import { formatDuration } from "./time";

type Kind = { name: string; weight: number; run: (sim: Sim, rng: Rng) => Promise<string> | null };

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function customerAction(name: string, weight: number, fn: typeof customer.book): Kind {
  return {
    name: `customer.${name}`,
    weight,
    // The action names its actor once it has picked a customer.
    run: (sim) =>
      sim.act(`customer.${name}`, { name: "customer", identity: null }, undefined, (a) => fn(sim, a)),
  };
}

function ownerAction(
  name: string,
  weight: number,
  fn: (sim: Sim, a: Parameters<typeof owner.approve>[1], b: SimBusiness) => Promise<string>,
): Kind {
  return {
    name: `owner.${name}`,
    weight,
    run: (sim, rng) => {
      const b = rng.maybePick(sim.world.businesses.filter((x) => !x.dormant));
      if (!b) return null;
      return sim.act(`owner.${name}`, owner.ownerOf(b), b.id, (a) => fn(sim, a, b));
    },
  };
}

function staffAction(name: string, weight: number, fn: typeof staff.staffList): Kind {
  return {
    name: `staff.${name}`,
    weight,
    run: (sim, rng) => {
      const b = rng.maybePick(
        sim.world.businesses.filter(
          (x) => !x.dormant && [...x.members.values()].some((m) => m.status === "active"),
        ),
      );
      if (!b) return null;
      const member = staff.pickStaff(rng, b);
      if (!member) return null;
      return sim.act(`staff.${name}`, staff.staffActor(b, member), b.id, (a) => fn(sim, a, b, member));
    },
  };
}

/** What bots do, and how often relative to each other. */
export const KINDS: Kind[] = [
  customerAction("book", 30, customer.book),
  customerAction("race", 4, customer.race),
  customerAction("fill_group", 3, customer.fillGroup),
  customerAction("cancel", 8, customer.cancel),
  customerAction("reschedule", 6, customer.reschedule),
  customerAction("pay_later", 3, customer.payLater),
  customerAction("view", 6, customer.view),
  customerAction("probe_invalid", 3, customer.probeInvalid),
  ownerAction("approve", 5, owner.approve),
  ownerAction("book", 6, (sim, a, b) => owner.staffBook(sim, a, b)),
  ownerAction("cancel", 3, owner.staffCancel),
  ownerAction("reschedule", 3, owner.staffReschedule),
  ownerAction("outcome", 4, (sim, a, b) => owner.outcome(sim, a, b)),
  ownerAction("paid_in_person", 2, owner.paidInPerson),
  ownerAction("service_create", 1.5, owner.serviceCreate),
  ownerAction("service_update", 3, owner.serviceUpdate),
  ownerAction("service_delete", 0.7, owner.serviceDelete),
  ownerAction("resource_create", 0.7, owner.resourceCreate),
  ownerAction("resource_delete", 0.4, owner.resourceDelete),
  ownerAction("hours_change", 2, owner.hoursChange),
  ownerAction("time_off_add", 2, owner.timeOffAdd),
  ownerAction("time_off_remove", 1.5, owner.timeOffRemove),
  ownerAction("closure_add", 0.7, owner.closureAdd),
  ownerAction("closure_remove", 0.6, owner.closureRemove),
  ownerAction("policies_change", 1, owner.policiesChange),
  ownerAction("team_invite", 0.7, owner.teamInvite),
  ownerAction("team_remove", 0.4, owner.teamRemove),
  staffAction("list", 2, staff.staffList),
  staffAction("book_own", 2, staff.staffBookOwn),
  staffAction("book_other", 0.7, staff.staffBookOther),
  staffAction("time_off", 0.7, staff.staffTimeOff),
  staffAction("outcome", 1, staff.staffOutcome),
];

/** How long a business stays in play after it fills up for the month. */
const RETIRE_AFTER_MS = 2 * 3_600_000;

/**
 * Opens a business through onboarding (`b<n>`, or the Free plan scenario's) and records it in the log, so `check` can
 * find it again. Null when onboarding failed (a harness error was recorded).
 */
async function openBusiness(sim: Sim, n: number, limitScenario: boolean): Promise<SimBusiness | null> {
  const key = limitScenario ? "limit" : `b${n}`;
  const ownerId = identity(sim.tag, "owner", limitScenario ? 0 : n, sim.auth.namespace);
  let created: SimBusiness | null = null;
  await sim.act(
    "setup.business",
    { name: `owner-${key}`, identity: ownerId },
    undefined,
    async () => {
      created = await createBusiness(
        sim.rng.child(`business:${key}`),
        key,
        n,
        sim.tag,
        ownerId,
        limitScenario,
        Date.now(),
      );
      return "created";
    },
    { setup: true },
  );
  const b = created as SimBusiness | null;
  if (b) {
    sim.log.write({
      type: "note",
      note: "business",
      key,
      id: b.id,
      slug: b.slug,
      owner: ownerId,
      timeZone: b.timeZone,
    });
  }
  return b;
}

/**
 * With Stripe Checkout: the business's Stripe test account, once Stripe can take charges on it (`stripe.ts`). Without
 * one it stays in play with online payments off, which the report says.
 */
async function setUpPayments(sim: Sim, b: SimBusiness) {
  await sim.act(
    "setup.payments",
    owner.ownerOf(b),
    b.id,
    async () => {
      const result = await enableOnlinePayments(() => requestSimulationAccount(b.id));
      b.onlinePayments = result.on;
      sim.coverage.record(b.key, result);
      sim.log.write({ type: "note", note: "payments", key: b.key, id: b.id, ...result });
      if (!result.on && !sim.options.quiet)
        process.stdout.write(`Online payments off at ${b.key}: ${result.reason}\n`);
      return result.on ? "online" : "offline";
    },
    { setup: true, stream: `setup.payments:${b.key}` },
  );
}

/** A regular business, in play once it has one staff member (linked to a person) and, with Stripe, its account. */
async function openRegularBusiness(sim: Sim, n: number): Promise<SimBusiness | null> {
  const b = await openBusiness(sim, n, false);
  if (!b) return null;
  await sim.act("setup.staff", owner.ownerOf(b), b.id, (a) => owner.teamInvite(sim, a, b), {
    setup: true,
    // Keyed by business, so an opening that failed doesn't shift the next one's draws.
    stream: `setup.staff:${b.key}`,
  });
  if (sim.options.payments === "stripe-checkout") await setUpPayments(sim, b);
  sim.world.addBusiness(b);
  return b;
}

/** The businesses, then the Free plan scenario on a business of its own. */
async function setUp(sim: Sim) {
  for (let i = 1; i <= sim.options.customers; i++)
    sim.customers.push(identity(sim.tag, "customer", i, sim.auth.namespace));
  const health = await attempt(publicApi.health());
  if (!health.ok)
    throw new Error(`The API at ${sim.options.baseUrl} is not healthy: ${health.code} ${health.message}`);
  for (let n = 1; n <= sim.options.businesses; n++) {
    if (!(await openRegularBusiness(sim, n)))
      throw new Error("Could not create the simulated businesses (see the harness error above).");
  }
  if (sim.options.planLimit) {
    const b = await openBusiness(sim, 0, true);
    if (b) {
      await sim.act("scenario.member_cap", owner.ownerOf(b), b.id, (a) => memberCapScenario(sim, a, b));
      await sim.act("scenario.plan_limit", owner.ownerOf(b), b.id, (a) => planLimitScenario(sim, a, b));
      sim.world.addBusiness(b);
    }
  }
}

/**
 * Keeps bookings flowing in long runs: a business full for the month retires after [RETIRE_AFTER_MS] (bots leave it,
 * the SQL checks still cover it), and while fewer than `--businesses` can still take bookings a new one opens.
 * Returns the opening in progress, if one started.
 */
function rotate(sim: Sim, nextKey: () => number, opening: boolean): Promise<SimBusiness | null> | null {
  const now = Date.now();
  for (const b of sim.world.businesses) {
    if (
      !b.dormant &&
      b.cappedAt !== null &&
      b.cappedMonth === todayIn(b, now).slice(0, 7) &&
      now - b.cappedAt > RETIRE_AFTER_MS
    ) {
      b.dormant = true;
      sim.log.write({ type: "note", note: "retired", key: b.key, id: b.id });
    }
  }
  const taking = sim.world.businesses.filter(
    (b) => !b.limitScenario && !b.dormant && b.cappedMonth !== todayIn(b, now).slice(0, 7),
  );
  if (opening || taking.length >= sim.options.businesses) return null;
  return openRegularBusiness(sim, nextKey());
}

export async function run(sim: Sim): Promise<boolean> {
  const { options } = sim;
  const startedAt = new Date();
  const say = (text: string) => {
    if (!options.quiet) process.stdout.write(`${text}\n`);
  };
  sim.log.write({
    type: "run",
    seed: options.seed,
    options: { ...options, databaseUrl: options.databaseUrl ? "(set)" : null },
    tag: sim.tag,
  });
  say(
    `Simulation seed ${options.seed} (tag ${sim.tag}) against ${options.baseUrl} for ${formatDuration(options.durationMs)} at ${options.rate} actions/min`,
  );

  const checker = new Checker(sim);
  // The check in progress, if any: checks never overlap.
  const inProgress: { check: Promise<void> | null } = { check: null };
  // A check that fails (not a violation: the checker itself broke) counts as a harness error, once; the promise a
  // caller gets never rejects.
  const check = (final = false): Promise<void> => {
    if (inProgress.check) return inProgress.check;
    const running = checker
      .run(final)
      .catch((error: unknown) => {
        sim.harnessErrors++;
        process.stderr.write(
          `\nThe check failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
      })
      .finally(() => {
        inProgress.check = null;
      });
    inProgress.check = running;
    return running;
  };

  try {
    await setUp(sim);
    say(`World ready: ${sim.world.businesses.map((b) => `${b.key}=${b.slug} (${b.timeZone})`).join(", ")}`);

    const end = Date.now() + options.durationMs;
    const interval = 60_000 / options.rate;
    const pending = new Set<Promise<unknown>>();
    let nextCheck = Date.now() + options.checkEveryMs;
    let nextRotation = Date.now() + 1_000;
    let businessKeys = options.businesses;
    let opening: Promise<unknown> | null = null;
    let nextProgress = Date.now() + 30_000;
    let nextStart = Date.now();
    const weights = KINDS.map((k) => [k, k.weight] as const);
    let picks = 0;
    while (Date.now() < end && !sim.stopping) {
      if (Date.now() >= nextCheck) {
        nextCheck = Date.now() + options.checkEveryMs;
        void check();
      }
      if (Date.now() >= nextRotation) {
        nextRotation = Date.now() + 1_000;
        const started = rotate(sim, () => ++businessKeys, opening !== null);
        if (started) {
          const tracked: Promise<unknown> = started
            .then((b) => {
              // Onboarding failed (a harness error is recorded): try again in a minute, not every second.
              if (!b) nextRotation = Date.now() + 60_000;
            })
            .finally(() => {
              opening = null;
              pending.delete(tracked);
            });
          opening = tracked;
          pending.add(tracked);
        }
      }
      if (Date.now() >= nextProgress) {
        nextProgress = Date.now() + 60_000;
        say(
          `  ${formatDuration(Date.now() - startedAt.getTime())}: ${sim.stats.actionCount()} actions, ${sim.stats.requests} requests, ` +
            `${sim.world.bookings().length} bookings, ${sim.violations.list.length} violations, ${sim.inFlight} in flight`,
        );
      }
      if (pending.size >= options.concurrency) {
        // Full: wait for an action to finish (or a quarter of a second, for checks and rotation).
        await Promise.race([...pending, pause(250)]);
        continue;
      }
      if (Date.now() < nextStart) {
        await pause(Math.min(25, nextStart - Date.now()));
        continue;
      }
      nextStart += interval;
      // Never bunch up after a stall: at most one interval behind.
      if (nextStart < Date.now() - interval) nextStart = Date.now();
      const kind = sim.rng.weighted(weights);
      const started = kind.run(sim, sim.rng.child(`pick:${picks++}`));
      if (!started) continue;
      const tracked = started.finally(() => pending.delete(tracked));
      pending.add(tracked);
      if (options.concurrency === 1) await tracked;
    }
    say(`Duration over; waiting for ${pending.size} actions in flight...`);
    await Promise.allSettled([...pending]);
    if (inProgress.check) await inProgress.check;
    await check();
    if (options.settleMs > 0 && !sim.stopping) {
      say(`Settling for ${formatDuration(options.settleMs)} (holds lapse, jobs drain)...`);
      await pause(options.settleMs);
    }
    await check(true);
  } catch (error) {
    sim.harnessErrors++;
    process.stderr.write(
      `\nThe run stopped: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  } finally {
    await checker.close();
    await sim.payer.close();
  }

  const failing = sim.violations.failing(options.strict);
  const summary: RunSummary = {
    seed: options.seed,
    baseUrl: options.baseUrl,
    startedAt: startedAt.toISOString(),
    elapsedMs: Date.now() - startedAt.getTime(),
    businesses: sim.world.businesses.length,
    bookings: sim.world.bookings().length,
    checks: checker.runs,
    harnessErrors: sim.harnessErrors,
    coverage: sim.coverage.summary(),
    violations: sim.violations.list,
    passed: failing.length === 0 && sim.harnessErrors === 0,
  };
  const report = renderReport(summary, sim.stats);
  sim.log.write({
    type: "summary",
    passed: summary.passed,
    violations: sim.violations.countsByInvariant(),
    actions: sim.stats.actionCount(),
    requests: sim.stats.requests,
    harnessErrors: sim.harnessErrors,
  });
  await sim.log.close();
  if (options.reportPath) {
    mkdirSync(dirname(options.reportPath), { recursive: true });
    writeFileSync(options.reportPath, report);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  process.stdout.write(`\n${report}\n`);
  if (!summary.passed) {
    process.stdout.write(
      `Seed ${options.seed}: ${failing.length} failing violations, ${sim.harnessErrors} harness errors.\n`,
    );
  }
  return summary.passed;
}
