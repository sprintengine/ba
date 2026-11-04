/**
 * The checker: runs every `--check-every` and at the end. Through the API (as each business's owner) it compares the
 * server's bookings with the shadow model and checks overlaps, group sizes, holds, refunds, outcomes and the Free plan's
 * limits; given a read-only DATABASE_URL it also checks the tables directly (allocations with their buffers and
 * exclusivity, jobs, reminders), which the API can't show.
 */
import { billingApi } from "@shared/api/billing";
import { bookingsApi } from "@shared/api/bookings";
import { teamApi } from "@shared/api/team";
import type { Booking, BookingStatus } from "@shared/api/types";
import pg from "pg";
import { attempt, runAs } from "./http";
import type { Sim } from "./runtime";
import { compareWithServer } from "./consistency";
import { BLOCKING, type SimBusiness } from "./shadow";
import { addDays } from "./time";
import { todayIn } from "./actions/common";

/** How long after its hold lapses a held booking may still be held (the expiry job runs every minute). */
export const HOLD_GRACE_MS = 3 * 60_000;
/** How long after it ends a confirmed booking may still be confirmed (auto-complete runs hourly). */
export const COMPLETE_GRACE_MS = 70 * 60_000;
/** How long after a cancellation its refund may take to show (the dev provider refunds at once, after the commit). */
const REFUND_SETTLE_MS = 15_000;
/** Statuses a booking ends in (an owner may still turn completed into no-show, which a bot does, so it is re-read). */
const FINAL: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "cancelled",
  "expired",
  "completed",
  "no_show",
]);

const ALL_STATUSES: BookingStatus[] = [
  "held",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "expired",
];

/** All of a business's bookings starting from two days ago until after its advance window. */
async function serverBookings(b: SimBusiness): Promise<Booking[]> {
  const today = todayIn(b);
  const out: Booking[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const result: { items: Booking[]; nextCursor: string | null } = await bookingsApi.list(b.id, {
      from: addDays(today, -3),
      to: addDays(today, Math.max(b.policies.maxAdvanceDays, 31) + 3),
      status: ALL_STATUSES,
      limit: 200,
      cursor,
    });
    out.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return out;
}

type Span = { booking: Booking; start: number; end: number; group: boolean };

/**
 * Overlaps among bookings that hold their time, from the API's view (start to end; buffers are checked in SQL, since
 * the API shows the service's current buffers rather than those the booking was made with).
 */
export function apiOverlaps(bookings: Booking[], capacityOf: (serviceId: string) => number | undefined) {
  const problems: { kind: "no-overlap" | "group-capacity"; message: string; bookingId: string }[] = [];
  const byResource = new Map<string, Span[]>();
  for (const booking of bookings) {
    if (!BLOCKING.has(booking.status)) continue;
    const span: Span = {
      booking,
      start: Date.parse(booking.start),
      end: Date.parse(booking.end),
      group: (capacityOf(booking.service.id) ?? 1) > 1,
    };
    for (const r of booking.resources) {
      let list = byResource.get(r.id);
      if (!list) byResource.set(r.id, (list = []));
      list.push(span);
    }
  }
  for (const [resourceId, spans] of byResource) {
    spans.sort((x, y) => x.start - y.start);
    for (let i = 0; i < spans.length; i++) {
      const x = spans[i]!;
      for (let j = i + 1; j < spans.length && spans[j]!.start < x.end; j++) {
        const y = spans[j]!;
        const sameSession =
          x.group && y.group && x.booking.service.id === y.booking.service.id && x.start === y.start;
        if (!sameSession) {
          problems.push({
            kind: "no-overlap",
            message: `bookings ${x.booking.id} (${x.booking.start}) and ${y.booking.id} (${y.booking.start}) overlap on resource ${resourceId}`,
            bookingId: y.booking.id,
          });
        }
      }
    }
    const sessions = new Map<string, Span[]>();
    for (const s of spans.filter((s) => s.group)) {
      const key = `${s.booking.service.id}|${s.start}`;
      sessions.set(key, [...(sessions.get(key) ?? []), s]);
    }
    for (const session of sessions.values()) {
      const capacity = capacityOf(session[0]!.booking.service.id) ?? 1;
      if (session.length > capacity) {
        problems.push({
          kind: "group-capacity",
          message: `${session.length} bookings in a ${capacity}-seat session at ${session[0]!.booking.start} on resource ${resourceId}`,
          bookingId: session[0]!.booking.id,
        });
      }
    }
  }
  return problems;
}

/** All sums of one choice from each refund's possible amounts (a refund made in several parts). */
export function refundTotals(options: number[][]): Set<number> {
  let totals = new Set<number>([0]);
  for (const choices of options) {
    const next = new Set<number>();
    for (const t of totals) for (const c of choices) next.add(t + c);
    totals = next;
    if (totals.size > 64) break;
  }
  return totals;
}

export class Checker {
  private pool: pg.Pool | null = null;
  runs = 0;

  /** [startedAt]: jobs created since then are the run's (the `check` command passes the run's start). */
  constructor(
    private readonly sim: Sim,
    readonly startedAt = new Date(),
  ) {
    if (sim.options.databaseUrl) {
      this.pool = new pg.Pool({
        connectionString: sim.options.databaseUrl,
        max: 2,
        // Read-only whatever the role may do: the checker never writes.
        options: "-c default_transaction_read_only=on",
      });
    }
  }

  async close() {
    await this.pool?.end();
  }

  /** One full check. [final]: also the end-of-run checks (every booking known, nothing busy). */
  async run(final = false): Promise<void> {
    this.runs++;
    const before = this.sim.violations.list.length;
    // Retired businesses are left to the SQL checks, except at the end.
    for (const b of this.sim.world.businesses.filter((x) => final || !x.dormant)) {
      await runAs({ token: this.sim.token(b.owner), actor: "checker", seq: 0, businessId: b.id }, () =>
        this.checkBusiness(b),
      );
    }
    if (this.pool) await this.sqlChecks();
    this.sim.log.write({
      type: "check",
      final,
      run: this.runs,
      newViolations: this.sim.violations.list.length - before,
    });
  }

  private async checkBusiness(b: SimBusiness) {
    const sim = this.sim;
    const listedFrom = Date.now();
    const listed = await attempt(serverBookings(b));
    if (!listed.ok) {
      sim.violate("expected-outcome", `the checker could not list bookings: ${listed.code}`, {
        businessId: b.id,
      });
      return;
    }
    const bookings = listed.value;
    const now = Date.now();
    const capacityOf = (serviceId: string) => b.services.get(serviceId)?.capacity;
    for (const p of apiOverlaps(bookings, capacityOf)) {
      sim.violate(p.kind, p.message, { businessId: b.id, bookingId: p.bookingId }, p.message);
    }
    const byId = new Map(bookings.map((x) => [x.id, x]));
    for (const server of bookings) {
      if (
        server.status === "held" &&
        server.holdExpiresAt &&
        Date.parse(server.holdExpiresAt) < now - HOLD_GRACE_MS
      ) {
        sim.violate(
          "hold-expiry",
          `booking ${server.id} is still held, its hold lapsed at ${server.holdExpiresAt}`,
          {
            businessId: b.id,
            bookingId: server.id,
          },
        );
      }
      if (server.status === "confirmed" && Date.parse(server.end) < now - COMPLETE_GRACE_MS) {
        sim.violate("auto-complete", `booking ${server.id} ended ${server.end} and is still confirmed`, {
          businessId: b.id,
          bookingId: server.id,
        });
      }
    }
    // The shadow: every booking the bots know, as they left it (or as it may have become on its own). One that ended
    // (cancelled, expired, completed, no-show) and was found right is not read again until a bot changes it.
    for (const known of sim.world.bookingsOf(b.id)) {
      if (known.busy > 0 || known.verifiedAt === known.changedAt) continue;
      let server = byId.get(known.id);
      let readFrom = listedFrom;
      if (!server) {
        readFrom = Date.now();
        const one = await attempt(bookingsApi.get(b.id, known.id));
        if (!one.ok) {
          sim.violate("state-consistency", `booking ${known.id} the bots made can't be read: ${one.code}`, {
            businessId: b.id,
            bookingId: known.id,
          });
          continue;
        }
        server = one.value;
      }
      if (!compareWithServer(sim, known, server, readFrom)) continue;
      const lastRefund = Math.max(0, ...known.refunds.map((r) => r.at));
      const refundsSettled = now - lastRefund > REFUND_SETTLE_MS;
      if (known.refunds.length > 0 && refundsSettled && known.refunds.every((r) => r.amounts.length > 0)) {
        const totals = refundTotals(known.refunds.map((r) => r.amounts));
        if (!totals.has(server.amountRefundedCents)) {
          const causes = known.refunds.map((r) => `${r.by}/${r.override}`).join(", ");
          sim.violate(
            "refund-policy",
            `booking ${known.id} refunded ${server.amountRefundedCents}, the policy says ${[...totals].join(" or ")} (${causes})`,
            { businessId: b.id, bookingId: known.id },
          );
        }
      }
      if (FINAL.has(server.status) && refundsSettled) known.verifiedAt = known.changedAt;
    }
    // The Free plan's limits.
    const billing = await attempt(billingApi.get(b.id));
    if (
      billing.ok &&
      billing.value.usage.limit !== null &&
      billing.value.usage.bookingsThisMonth > billing.value.usage.limit
    ) {
      sim.violate(
        "plan-limit",
        `${billing.value.usage.bookingsThisMonth} bookings this month on a ${billing.value.usage.limit}-booking plan`,
        { businessId: b.id },
        `${b.id}|usage|${billing.value.usage.bookingsThisMonth}`,
      );
    }
    const team = await attempt(teamApi.list(b.id));
    if (team.ok && team.value.length > 3) {
      sim.violate(
        "member-cap",
        `a Free business has ${team.value.length} members and invitations`,
        { businessId: b.id },
        `${b.id}|${team.value.length}`,
      );
    }
  }

  private async query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool!.query<T>(sql, params);
    return result.rows;
  }

  /** Checks the tables of the simulated businesses directly (and the job queue as a whole). */
  private async sqlChecks() {
    const sim = this.sim;
    const ids = sim.world.businesses.map((b) => b.id);
    if (ids.length === 0) return;
    try {
      const overlaps = await this.query<{
        a: string;
        b: string;
        resource_id: string;
        business_id: string;
        ra: string;
        rb: string;
      }>(
        `SELECT a1.booking_id AS a, a2.booking_id AS b, a1.resource_id, a1.business_id, a1.time_range::text AS ra, a2.time_range::text AS rb
           FROM booking_allocations a1
           JOIN booking_allocations a2 ON a2.resource_id = a1.resource_id AND a2.id > a1.id AND a2.time_range && a1.time_range
           JOIN bookings b1 ON b1.id = a1.booking_id
           JOIN bookings b2 ON b2.id = a2.booking_id
          WHERE a1.active AND a2.active AND a1.business_id = ANY($1) AND a1.booking_id <> a2.booking_id
            AND (a1.exclusive OR a2.exclusive OR b1.service_id <> b2.service_id OR b1.start_at <> b2.start_at)`,
        [ids],
      );
      for (const o of overlaps) {
        sim.violate(
          "no-overlap",
          `allocations of ${o.a} (${o.ra}) and ${o.b} (${o.rb}) overlap on resource ${o.resource_id}`,
          {
            businessId: o.business_id,
            bookingId: o.b,
          },
          `${o.a}|${o.b}`,
        );
      }
      const crowded = await this.query<{
        business_id: string;
        resource_id: string;
        start_at: Date;
        n: string;
        capacity: number;
      }>(
        `SELECT a.business_id, a.resource_id, b.start_at, count(DISTINCT b.id) AS n, s.capacity
           FROM booking_allocations a JOIN bookings b ON b.id = a.booking_id JOIN services s ON s.id = b.service_id
          WHERE a.active AND NOT a.exclusive AND a.business_id = ANY($1)
          GROUP BY a.business_id, a.resource_id, b.service_id, b.start_at, s.capacity
         HAVING count(DISTINCT b.id) > s.capacity`,
        [ids],
      );
      for (const c of crowded) {
        sim.violate(
          "group-capacity",
          `${c.n} bookings in a ${c.capacity}-seat session at ${c.start_at.toISOString()} on ${c.resource_id}`,
          {
            businessId: c.business_id,
          },
          `${c.resource_id}|${c.start_at.toISOString()}|${c.n}`,
        );
      }
      const leaks = await this.query<{ id: string; business_id: string; status: string; active: string }>(
        `SELECT b.id, b.business_id, b.status::text AS status,
                count(*) FILTER (WHERE a.active) AS active
           FROM bookings b LEFT JOIN booking_allocations a ON a.booking_id = b.id
          WHERE b.business_id = ANY($1)
          GROUP BY b.id
         HAVING (b.status IN ('held', 'pending_approval', 'confirmed') AND count(*) FILTER (WHERE a.active) = 0)
             OR (b.status NOT IN ('held', 'pending_approval', 'confirmed') AND count(*) FILTER (WHERE a.active) > 0)`,
        [ids],
      );
      for (const l of leaks) {
        sim.violate(
          "state-consistency",
          `booking ${l.id} is ${l.status} with ${l.active} active allocations (holding its time ${BLOCKING.has(l.status as BookingStatus) ? "without" : "after"} it should)`,
          { businessId: l.business_id, bookingId: l.id },
          `${l.id}|${l.status}|leak`,
        );
      }
      const holds = await this.query<{ id: string; business_id: string; hold_expires_at: Date }>(
        `SELECT id, business_id, hold_expires_at FROM bookings
          WHERE status = 'held' AND hold_expires_at < now() - make_interval(secs => $1) AND business_id = ANY($2)`,
        [HOLD_GRACE_MS / 1000, ids],
      );
      for (const h of holds) {
        sim.violate(
          "hold-expiry",
          `booking ${h.id} is still held, its hold lapsed at ${h.hold_expires_at.toISOString()}`,
          {
            businessId: h.business_id,
            bookingId: h.id,
          },
        );
      }
      const money = await this.query<{
        id: string;
        business_id: string;
        paid: number;
        refunded: number;
        refunds: string;
      }>(
        `SELECT b.id, b.business_id, b.amount_paid_cents AS paid, b.amount_refunded_cents AS refunded,
                coalesce(sum(p.amount_cents) FILTER (WHERE p.kind = 'refund' AND p.status = 'succeeded'), 0) AS refunds
           FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id
          WHERE b.business_id = ANY($1)
          GROUP BY b.id
         HAVING coalesce(sum(p.amount_cents) FILTER (WHERE p.kind = 'refund' AND p.status = 'succeeded'), 0) > b.amount_paid_cents`,
        [ids],
      );
      for (const m of money) {
        sim.violate(
          "refund-policy",
          `booking ${m.id} paid ${m.paid}, refunded ${m.refunded} (refund payments ${m.refunds})`,
          {
            businessId: m.business_id,
            bookingId: m.id,
          },
        );
      }
      const plans = await this.query<{ id: string; n: string }>(
        `SELECT bz.id, count(b.id) AS n
           FROM businesses bz JOIN bookings b ON b.business_id = bz.id
          WHERE bz.plan = 'free' AND bz.id = ANY($1) AND b.status <> 'expired'
            AND b.created_at >= date_trunc('month', now() AT TIME ZONE bz.timezone) AT TIME ZONE bz.timezone
          GROUP BY bz.id HAVING count(b.id) > 100`,
        [ids],
      );
      for (const p of plans) {
        sim.violate(
          "plan-limit",
          `${p.n} bookings this month on the Free plan`,
          { businessId: p.id },
          `${p.id}|sql|${p.n}`,
        );
      }
      const members = await this.query<{ business_id: string; n: string }>(
        `SELECT m.business_id, count(*) AS n FROM business_members m JOIN businesses bz ON bz.id = m.business_id
          WHERE bz.plan = 'free' AND m.status IN ('active', 'invited') AND m.business_id = ANY($1)
          GROUP BY m.business_id HAVING count(*) > 3`,
        [ids],
      );
      for (const m of members) {
        sim.violate(
          "member-cap",
          `${m.n} members and invitations on the Free plan`,
          { businessId: m.business_id },
          `${m.business_id}|sql|${m.n}`,
        );
      }
      const confirmedLate = await this.query<{ id: string; business_id: string; end_at: Date }>(
        `SELECT id, business_id, end_at FROM bookings
          WHERE status = 'confirmed' AND end_at < now() - make_interval(secs => $1) AND business_id = ANY($2)`,
        [COMPLETE_GRACE_MS / 1000, ids],
      );
      for (const c of confirmedLate) {
        sim.violate(
          "auto-complete",
          `booking ${c.id} ended ${c.end_at.toISOString()} and is still confirmed`,
          {
            businessId: c.business_id,
            bookingId: c.id,
          },
        );
      }
      // Reminders are claimed every 5 minutes for confirmed bookings starting within 24 hours.
      const reminders = await this.query<{ id: string; business_id: string; start_at: Date }>(
        `SELECT id, business_id, start_at FROM bookings
          WHERE status = 'confirmed' AND reminder_sent_at IS NULL AND business_id = ANY($1)
            AND start_at > now() AND start_at <= now() + interval '23 hours'
            AND updated_at < now() - interval '8 minutes'`,
        [ids],
      );
      for (const r of reminders) {
        sim.violate(
          "reminders",
          `booking ${r.id} starts ${r.start_at.toISOString()} and has no reminder claimed`,
          {
            businessId: r.business_id,
            bookingId: r.id,
          },
        );
      }
      // The job queue as a whole, since the run started.
      const jobs = await this.query<{
        id: string;
        kind: string;
        status: string;
        attempts: number;
        last_error: string | null;
      }>(
        `SELECT id, kind, status::text AS status, attempts, last_error FROM jobs
          WHERE created_at >= $1 AND (
                status = 'failed'
             OR (status = 'running' AND locked_at < now() - interval '10 minutes')
             OR (status = 'pending' AND attempts = 0 AND run_at < now() - interval '5 minutes'))`,
        [this.startedAt],
      );
      for (const j of jobs) {
        sim.violate(
          "jobs-healthy",
          `job ${j.id} (${j.kind}) is ${j.status} after ${j.attempts} attempts: ${j.last_error ?? "no error"}`,
          {
            jobId: j.id,
          },
          j.id,
        );
      }
    } catch (error) {
      process.stderr.write(`SQL checks failed: ${error instanceof Error ? error.message : String(error)}\n`);
      this.sim.harnessErrors++;
    }
  }
}
