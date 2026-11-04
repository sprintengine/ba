import { ApiError } from "@shared/api/client";
import { describe, expect, it } from "vitest";
import { enableOnlinePayments, PaymentsCoverage, readAnswer, type SimulationAccount } from "../src/stripe";

const account = (chargesEnabled: boolean, requirementsDue: string[] = []): SimulationAccount => ({
  accountId: "acct_1",
  chargesEnabled,
  detailsSubmitted: true,
  requirementsDue,
});

function apiError(status: number, code: string, message = "nope"): ApiError {
  return new ApiError(status, code, message);
}

/** A fake endpoint answering [answers] in turn (the last one again after that), and a fake clock. */
function endpoint(answers: (SimulationAccount | ApiError)[]) {
  let calls = 0;
  let now = 0;
  return {
    get calls() {
      return calls;
    },
    request: () => {
      const answer = answers[Math.min(calls++, answers.length - 1)]!;
      return answer instanceof ApiError ? Promise.reject(answer) : Promise.resolve(answer);
    },
    options: {
      timeoutMs: 60_000,
      pollMs: 5_000,
      now: () => now,
      sleep: (ms: number) => {
        now += ms;
        return Promise.resolve();
      },
    },
  };
}

describe("readAnswer", () => {
  it("tells ready, pending, retry and off apart", () => {
    expect(readAnswer({ ok: true, value: account(true) })).toEqual({ kind: "ready", accountId: "acct_1" });
    expect(readAnswer({ ok: true, value: account(false, ["individual.dob"]) })).toEqual({
      kind: "pending",
      accountId: "acct_1",
      due: ["individual.dob"],
    });
    expect(readAnswer({ ok: false, status: 404, code: "NOT_FOUND", message: "Not found." }).kind).toBe("off");
    expect(
      readAnswer({ ok: false, status: 409, code: "PAYMENTS_NOT_CONFIGURED", message: "No test key." }),
    ).toEqual({ kind: "off", reason: "No test key." });
    expect(readAnswer({ ok: false, status: 409, code: "CONFLICT", message: "Has one." }).kind).toBe("off");
    expect(readAnswer({ ok: false, status: 502, code: "PAYMENT_PROVIDER_ERROR", message: "x" }).kind).toBe(
      "retry",
    );
    expect(readAnswer({ ok: false, status: 0, code: "NETWORK_ERROR", message: "x" }).kind).toBe("retry");
    expect(readAnswer({ ok: false, status: 429, code: "RATE_LIMITED", message: "x" }).kind).toBe("retry");
  });
});

describe("enableOnlinePayments", () => {
  it("asks until Stripe enables charges", async () => {
    const e = endpoint([account(false), account(false), account(true)]);
    expect(await enableOnlinePayments(e.request, e.options)).toEqual({ on: true, accountId: "acct_1" });
    expect(e.calls).toBe(3);
  });

  it("falls back at once when the server has no Stripe test mode, or no such route", async () => {
    for (const error of [
      apiError(409, "PAYMENTS_NOT_CONFIGURED", "Simulation Stripe accounts need Stripe in test mode."),
      apiError(404, "NOT_FOUND"),
    ]) {
      const e = endpoint([error]);
      const result = await enableOnlinePayments(e.request, e.options);
      expect(result.on).toBe(false);
      expect(e.calls).toBe(1);
    }
  });

  it("gives up when Stripe never enables charges, saying what is still due", async () => {
    const e = endpoint([account(false, ["external_account"])]);
    const result = await enableOnlinePayments(e.request, e.options);
    expect(result).toEqual({
      on: false,
      reason: "Stripe didn't enable charges on acct_1 within 60 s (still due: external_account)",
    });
    // At 0, 5, ... 60 s.
    expect(e.calls).toBe(13);
  });

  it("retries a failing server until the deadline, then gives up", async () => {
    const e = endpoint([apiError(502, "PAYMENT_PROVIDER_ERROR"), account(true)]);
    expect((await enableOnlinePayments(e.request, e.options)).on).toBe(true);
    const down = endpoint([apiError(502, "PAYMENT_PROVIDER_ERROR")]);
    const result = await enableOnlinePayments(down.request, down.options);
    expect(result).toEqual({
      on: false,
      reason: "the server kept failing for 60 s (502 PAYMENT_PROVIDER_ERROR)",
    });
  });
});

describe("PaymentsCoverage", () => {
  it("says nothing with dev payments, and which businesses had paid coverage off and why", () => {
    const coverage = new PaymentsCoverage();
    expect(coverage.summary()).toBeNull();
    coverage.record("b1", { on: true, accountId: "acct_1" });
    expect(coverage.partial).toBe(false);
    expect(coverage.summary()).toBe("Paid online bookings: on at all 1 businesses (Stripe test accounts).");
    coverage.record("b2", { on: false, reason: "no test key" });
    coverage.record("b3", { on: false, reason: "no test key" });
    expect(coverage.partial).toBe(true);
    expect(coverage.summary()).toBe(
      "Paid online bookings: **off** at 2 of 3 businesses, which took free and pay-at-venue bookings only " +
        "(b2, b3: no test key).",
    );
  });
});
