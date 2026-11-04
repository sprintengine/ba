/**
 * Payments on staging (docs/simulation.md, "Payments on staging"). With `--payments stripe-checkout`, each simulated
 * business asks the backend for a Stripe test account (`POST /v1/businesses/{id}/payments/simulation-account`, which
 * only exists on staging with the simulation sign-in, for a simulation owner of a simulation business) and waits until
 * Stripe enables charges on it. Where the server can't give one (no Stripe test key, not staging, Stripe refused it or
 * never enabled it), the business runs without online payments: bots book its free and pay-at-venue services only,
 * and the report says paid coverage is off for it, instead of every paid booking ending in `PAYMENTS_NOT_CONFIGURED`.
 */
import { api } from "@shared/api/client";
import { attempt, type Outcome } from "./http";

/** The endpoint's answer. */
export type SimulationAccount = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason?: string | null;
};

/** Whether a business takes online payments in this run, and if not, why. */
export type OnlinePayments = { on: true; accountId: string } | { on: false; reason: string };

/** What one answer means: done, ask again (Stripe is still checking, or the server failed), or give up. */
export type AccountStep =
  | { kind: "ready"; accountId: string }
  | { kind: "pending"; accountId: string; due: string[] }
  | { kind: "retry"; reason: string }
  | { kind: "off"; reason: string };

export function readAnswer(outcome: Outcome<SimulationAccount>): AccountStep {
  if (outcome.ok) {
    const a = outcome.value;
    return a.chargesEnabled
      ? { kind: "ready", accountId: a.accountId }
      : { kind: "pending", accountId: a.accountId, due: a.requirementsDue ?? [] };
  }
  // The path doesn't exist here (production-like, or no simulation sign-in): the same 404 as any unknown path.
  if (outcome.status === 404)
    return {
      kind: "off",
      reason: "the server gives no simulation Stripe accounts (staging with the simulation sign-in only)",
    };
  if (outcome.code === "PAYMENTS_NOT_CONFIGURED") return { kind: "off", reason: outcome.message };
  if (outcome.status === 0 || outcome.status >= 500 || outcome.code === "RATE_LIMITED")
    return { kind: "retry", reason: `${outcome.status} ${outcome.code}` };
  return { kind: "off", reason: `${outcome.status} ${outcome.code}: ${outcome.message}` };
}

export type EnableOptions = {
  /** How long to wait for Stripe to enable charges. */
  timeoutMs: number;
  pollMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export const ENABLE_DEFAULTS = { timeoutMs: 180_000, pollMs: 5_000 } as const;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Asks [request] (the endpoint) until the account can take payments, the server says it can't, or time is up. */
export async function enableOnlinePayments(
  request: () => Promise<SimulationAccount>,
  options: EnableOptions = ENABLE_DEFAULTS,
): Promise<OnlinePayments> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? pause;
  const deadline = now() + options.timeoutMs;
  for (;;) {
    const step = readAnswer(await attempt(request()));
    if (step.kind === "ready") return { on: true, accountId: step.accountId };
    if (step.kind === "off") return { on: false, reason: step.reason };
    if (now() + options.pollMs > deadline) {
      const waited = `${Math.round(options.timeoutMs / 1000)} s`;
      return {
        on: false,
        reason:
          step.kind === "pending"
            ? `Stripe didn't enable charges on ${step.accountId} within ${waited}` +
              (step.due.length > 0 ? ` (still due: ${step.due.join(", ")})` : "")
            : `the server kept failing for ${waited} (${step.reason})`,
      };
    }
    await sleep(options.pollMs);
  }
}

/** `POST /v1/businesses/{id}/payments/simulation-account` as the current actor (the business's owner bot). */
export function requestSimulationAccount(businessId: string): Promise<SimulationAccount> {
  return api.post<SimulationAccount>(
    `/v1/businesses/${encodeURIComponent(businessId)}/payments/simulation-account`,
  );
}

/** Which businesses took online payments, for the report. */
export class PaymentsCoverage {
  private readonly online: string[] = [];
  private readonly offline = new Map<string, string>();

  record(key: string, result: OnlinePayments) {
    if (result.on) this.online.push(key);
    else this.offline.set(key, result.reason);
  }

  /** Whether paid online bookings were left out anywhere. */
  get partial(): boolean {
    return this.offline.size > 0;
  }

  /** One line for the report; null when nothing was recorded (dev payments: every business takes them). */
  summary(): string | null {
    const total = this.online.length + this.offline.size;
    if (total === 0) return null;
    if (!this.partial) return `Paid online bookings: on at all ${total} businesses (Stripe test accounts).`;
    const reasons = new Map<string, string[]>();
    for (const [key, reason] of this.offline) reasons.set(reason, [...(reasons.get(reason) ?? []), key]);
    const why = [...reasons].map(([reason, keys]) => `${keys.join(", ")}: ${reason}`).join("; ");
    return (
      `Paid online bookings: **off** at ${this.offline.size} of ${total} businesses, which took free and ` +
      `pay-at-venue bookings only (${why}).`
    );
  }
}
