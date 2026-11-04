/**
 * The invariants the simulation asserts (docs/simulation.md, "Invariants") and the violations it found. A violation
 * fails the run unless its invariant is a documented known failure (a real bug recorded but not fixed yet), which is
 * reported but tolerated; `--strict` fails on those too.
 */

export const INVARIANTS = {
  "no-5xx": "No request ever gets a 5xx response.",
  "expected-outcome":
    "Every request ends in one of the outcomes its action allows (e.g. 201, or 409 SLOT_UNAVAILABLE).",
  "no-overlap":
    "No resource has two active allocations that overlap (buffers included) unless both are seats of one group session.",
  "group-capacity": "A group session never has more bookings than the service's capacity.",
  "valid-slot":
    "A booking is only created at a time the business offered: open hours, its grid, notice and advance windows.",
  "creation-contract":
    "A new booking has the duration, resources, price and first status its service and payment choice imply.",
  "hold-expiry": "No booking is still held after its hold expired (plus the expiry job's grace).",
  "jobs-healthy": "No job failed for good, is stuck running or overdue in the queue.",
  "refund-policy": "Every cancellation refunds what the policy says, never more than was paid.",
  idempotency:
    "A repeated request with the same Idempotency-Key returns the same booking; a different body is refused with 409.",
  "plan-limit":
    "A Free business takes at most 100 bookings a month (staff ones count), then refuses with PLAN_LIMIT_REACHED.",
  "member-cap":
    "A Free business has at most 3 team members (active and invited); a fourth invitation is refused.",
  "state-consistency":
    "The server's bookings match what the bots did (no booking changed status without a cause).",
  "staff-scope": "Staff see and book only bookings on their own calendar.",
  "auto-complete": "Confirmed bookings are marked completed within the hour after they end.",
  reminders:
    "Confirmed bookings starting within 23 hours have had their reminder claimed (5-minute job, an hour's margin).",
} as const;

export type InvariantId = keyof typeof INVARIANTS;

/**
 * Real bugs the simulation finds that are not fixed yet: the invariant, and why it fails. Each is explained in
 * docs/simulation.md ("Known failures"). Empty when every bug found has been fixed.
 */
export const KNOWN_FAILURES: Partial<Record<InvariantId, string>> = {};

export type ViolationContext = {
  businessId?: string;
  bookingId?: string;
  requestId?: string;
  actionSeq?: number;
  actor?: string;
  [key: string]: unknown;
};

export type Violation = {
  invariant: InvariantId;
  message: string;
  at: string;
  context: ViolationContext;
  known: boolean;
};

export class Violations {
  readonly list: Violation[] = [];
  private readonly seen = new Set<string>();
  private readonly listeners: ((v: Violation) => void)[] = [];

  constructor(private readonly known: Partial<Record<InvariantId, string>> = KNOWN_FAILURES) {}

  /** Records a violation once per (invariant, dedupe key); returns it, or null for a repeat. */
  record(
    invariant: InvariantId,
    message: string,
    context: ViolationContext = {},
    dedupeKey?: string,
  ): Violation | null {
    const key = `${invariant}|${dedupeKey ?? message}`;
    if (this.seen.has(key)) return null;
    this.seen.add(key);
    const violation: Violation = {
      invariant,
      message,
      at: new Date().toISOString(),
      context,
      known: invariant in this.known,
    };
    this.list.push(violation);
    for (const listener of this.listeners) listener(violation);
    return violation;
  }

  onViolation(listener: (v: Violation) => void) {
    this.listeners.push(listener);
  }

  /** Violations that fail the run: all of them when [strict], else those not known. */
  failing(strict = false): Violation[] {
    return this.list.filter((v) => strict || !v.known);
  }

  countsByInvariant(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const v of this.list) counts[v.invariant] = (counts[v.invariant] ?? 0) + 1;
    return counts;
  }
}
