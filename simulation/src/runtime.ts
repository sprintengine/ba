/**
 * The simulation's runtime: options, the seeded root stream, the shadow world, the log, statistics and violations, and
 * `act`, which runs one bot action in its own call context and records how it went.
 */
import type { AuthProvider, SimIdentity } from "./auth";
import {
  attempt,
  currentCall,
  focus,
  installClient,
  lastRequest,
  runAs,
  type CallContext,
  type Outcome,
} from "./http";
import { INVARIANTS, Violations, type InvariantId, type ViolationContext } from "./invariants";
import type { Options } from "./options";
import type { Payer } from "./payer";
import { Rng } from "./rng";
import { World, type SimBooking } from "./shadow";
import { Stats } from "./stats";
import { ActionLog, formatTrailEntry } from "./trail";

/** Codes any call may end in without that being a finding (reported in the summary all the same). */
const ALWAYS_ALLOWED = new Set(["RATE_LIMITED"]);

export class Sim {
  readonly rng: Rng;
  readonly world = new World();
  readonly stats = new Stats();
  readonly violations = new Violations();
  readonly log: ActionLog;
  /** A short tag for names, slugs and emails: from the seed, so a replay names things the same way. */
  readonly tag: string;
  /** The customers who book (guests mostly; some sign in). */
  customers: SimIdentity[] = [];
  private seq = 0;
  /** Setup actions (opening a business) count apart, below zero: their timing must not shift the bots' streams. */
  private setupSeq = 0;
  inFlight = 0;
  harnessErrors = 0;
  stopping = false;

  constructor(
    readonly options: Options,
    readonly auth: AuthProvider,
    readonly payer: Payer,
  ) {
    this.rng = new Rng(options.seed);
    this.tag = this.rng.child("tag").token(5);
    this.log = new ActionLog(options.logPath);
    installClient(
      options.baseUrl,
      `${options.seed}`,
      (record, ctx) => {
        this.stats.recordRequest(record.endpoint, record.status, record.ms);
        this.log.write({
          type: "request",
          seq: ctx?.seq,
          actor: ctx?.actor,
          businessId: ctx?.businessId,
          bookingIds: ctx?.bookingIds ? [...ctx.bookingIds] : undefined,
          method: record.method,
          path: record.path,
          status: record.status,
          code: record.code,
          ms: record.ms,
          requestId: record.requestId,
        });
        if (record.status === 0 || record.status >= 500) {
          this.violate(
            "no-5xx",
            `${record.method} ${record.endpoint} answered ${record.status === 0 ? "nothing (network error)" : record.status}`,
            {
              requestId: record.requestId,
              actionSeq: ctx?.seq,
              actor: ctx?.actor,
              businessId: ctx?.businessId,
            },
            record.requestId,
          );
        }
      },
      () => auth.guestHeaders(),
    );
    this.violations.onViolation((v) => {
      this.log.write({
        type: "violation",
        invariant: v.invariant,
        message: v.message,
        context: v.context,
        known: v.known,
      });
      if (!this.options.quiet || !v.known) this.printViolation(v.invariant, v.message, v.context, v.known);
      if (this.options.failFast && !v.known) this.stopping = true;
    });
  }

  private printViolation(invariant: InvariantId, message: string, context: ViolationContext, known: boolean) {
    const lines = [
      `\n${known ? "KNOWN FAILURE" : "VIOLATION"} [${invariant}] ${message}`,
      `  invariant: ${INVARIANTS[invariant]}`,
      `  seed: ${this.options.seed}  context: ${JSON.stringify(context)}`,
    ];
    const trail = this.log.trailFor(context);
    if (trail.length > 0) {
      lines.push("  trail:");
      for (const e of trail) lines.push(`    ${formatTrailEntry(e)}`);
    }
    process.stderr.write(`${lines.join("\n")}\n`);
  }

  violate(invariant: InvariantId, message: string, context: ViolationContext = {}, dedupeKey?: string) {
    const call = currentCall();
    const full: ViolationContext = {
      actionSeq: call?.seq,
      actor: call?.actor,
      businessId: call?.businessId,
      requestId: lastRequest()?.requestId,
      ...context,
    };
    this.violations.record(invariant, message, full, dedupeKey);
  }

  token(identity: SimIdentity | null): string | null {
    return identity ? this.auth.tokenFor(identity) : null;
  }

  /**
   * Runs one action as [actor]: its own seeded stream (by sequence number, so it doesn't depend on how other actions
   * interleave), its requests logged under it, and its outcome counted. [fn] returns the outcome (`ok`, `slot_taken`...).
   */
  async act(
    kind: string,
    actor: { name: string; identity: SimIdentity | null },
    businessId: string | undefined,
    fn: (a: ActionScope) => Promise<string>,
    options: { setup?: boolean; stream?: string } = {},
  ): Promise<string> {
    const seq = options.setup ? -++this.setupSeq : ++this.seq;
    const rng = this.rng.child(options.stream ?? `action:${seq}`);
    const ctx: CallContext = { token: this.token(actor.identity), actor: actor.name, seq, businessId };
    const started = Date.now();
    this.inFlight++;
    let outcome: string;
    let detail: unknown;
    const scope = new ActionScope(this, seq, kind, actor.name, rng);
    try {
      outcome = await runAs(ctx, () => fn(scope));
    } catch (error) {
      // Not an API answer (those are outcomes): a bug in the simulation itself, or the stack going away.
      outcome = "harness_error";
      this.harnessErrors++;
      detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`\nharness error in #${seq} ${kind}: ${String(detail)}\n`);
    } finally {
      this.inFlight--;
      scope.releaseClaims();
    }
    this.stats.recordAction(kind, outcome);
    this.log.write({
      type: "action",
      seq,
      actor: ctx.actor,
      kind,
      businessId: ctx.businessId,
      bookingIds: ctx.bookingIds ? [...ctx.bookingIds] : undefined,
      outcome,
      ms: Date.now() - started,
      detail,
    });
    return outcome;
  }

  /** Runs [fn] as another identity inside the current action (same sequence number, other token). */
  as<T>(identity: SimIdentity | null, name: string, fn: () => Promise<T>): Promise<T> {
    const parent = currentCall();
    return runAs(
      {
        token: this.token(identity),
        actor: name,
        seq: parent?.seq ?? 0,
        businessId: parent?.businessId,
        bookingIds: parent?.bookingIds,
        parent,
      },
      fn,
    );
  }
}

/** What an action gets: its stream and helpers that hold calls to what they may answer. */
export class ActionScope {
  private readonly claimed: SimBooking[] = [];

  constructor(
    readonly sim: Sim,
    readonly seq: number,
    readonly kind: string,
    readonly actor: string,
    readonly rng: Rng,
  ) {}

  /**
   * Marks a booking this action created as busy until the action ends, so no other action (or the checker) works on
   * it while its creator is still paying for it or checking its replay.
   */
  claim(booking: SimBooking): SimBooking {
    focus(booking.businessId, booking.id);
    booking.busy++;
    this.claimed.push(booking);
    return booking;
  }

  /** Called when the action ends. */
  releaseClaims() {
    const now = Date.now();
    for (const booking of this.claimed.splice(0)) {
      booking.busy--;
      booking.changedAt = now;
    }
  }

  /**
   * Awaits a call that may succeed or fail with one of [allowed] error codes; any other failure is an
   * `expected-outcome` violation (with the request id). Returns the outcome either way.
   */
  async expect<T>(what: string, call: Promise<T>, allowed: readonly string[] = []): Promise<Outcome<T>> {
    const outcome = await attempt(call);
    if (
      !outcome.ok &&
      outcome.status > 0 &&
      outcome.status < 500 &&
      !allowed.includes(outcome.code) &&
      !ALWAYS_ALLOWED.has(outcome.code)
    ) {
      this.sim.violate(
        "expected-outcome",
        `${what}: ${outcome.status} ${outcome.code} "${outcome.message}" (allowed: ${allowed.length ? allowed.join(", ") : "success only"})`,
        {},
        `${this.kind}|${what}|${outcome.code}`,
      );
    }
    return outcome;
  }

  /** Like [expect], for a call that must succeed: its value, or null (and a violation) when it didn't. */
  async must<T>(what: string, call: Promise<T>): Promise<T | null> {
    const outcome = await this.expect(what, call);
    return outcome.ok ? outcome.value : null;
  }
}
