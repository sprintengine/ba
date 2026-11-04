/** Owner/admin areas: billing, payment provider connection, reports and AI usage. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAiUsage } from "./use-ai";
import { useBilling, useBillingCheckout, useBillingPortal } from "./use-billing";
import { useConnectPayments, usePaymentsStatus } from "./use-payments";
import { useReportSummary } from "./use-reports";
import { BIZ, json, renderApiHook, stubApi, type QueryView } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;
const returnUrl = { returnUrl: "https://app.test/settings/billing" };

describe("admin queries", () => {
  it.each([
    ["useBilling", () => useBilling(BIZ), "/billing"],
    ["usePaymentsStatus", () => usePaymentsStatus(BIZ), "/payments/status"],
    ["useAiUsage", () => useAiUsage(BIZ), "/ai/usage"],
  ] as const)("%s GETs %s", async (_name, hook, path) => {
    stubApi({ [`GET ${base}${path}`]: json({ ok: path }) });
    const { result } = renderApiHook<QueryView>(hook);
    await waitFor(() => expect(result.current.data).toEqual({ ok: path }));
  });

  it.each([
    ["useBilling", () => useBilling("")],
    ["usePaymentsStatus", () => usePaymentsStatus("")],
    ["useAiUsage", () => useAiUsage("")],
  ] as const)("%s waits for a business id", (_name, hook) => {
    const api = stubApi();
    expect(renderApiHook<QueryView>(hook).result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("useReportSummary sends the range and waits until both ends are set", async () => {
    const range = { from: "2026-09-01", to: "2026-09-30" };
    const api = stubApi({ [`GET ${base}/reports/summary`]: json({ totals: {} }) });
    const { result } = renderApiHook(() => ({
      summary: useReportSummary(BIZ, range),
      noEnd: useReportSummary(BIZ, { from: "2026-09-01", to: "" }),
    }));
    await waitFor(() => expect(result.current.summary.isSuccess).toBe(true));
    expect(result.current.noEnd.fetchStatus).toBe("idle");
    expect(api.calls.map((c) => c.query)).toEqual([range]);
  });
});

describe("admin mutations", () => {
  it("billing checkout and portal resolve to a URL and cache nothing", async () => {
    const api = stubApi({
      [`POST ${base}/billing/checkout`]: json({ url: "https://stripe.test/checkout" }),
      [`POST ${base}/billing/portal`]: json({ url: "https://stripe.test/portal" }),
    });
    const view = renderApiHook(() => ({ checkout: useBillingCheckout(BIZ), portal: useBillingPortal(BIZ) }), {
      seed: true,
    });
    const checkoutInput = { plan: "pro" as const, ...returnUrl };

    await expect(act(() => view.result.current.checkout.mutateAsync(checkoutInput))).resolves.toEqual({
      url: "https://stripe.test/checkout",
    });
    await expect(act(() => view.result.current.portal.mutateAsync(returnUrl))).resolves.toEqual({
      url: "https://stripe.test/portal",
    });

    expect(api.calls.map((c) => c.body)).toEqual([checkoutInput, returnUrl]);
    expect(view.invalidated()).toEqual([]);
  });

  it("connecting payments resolves to the onboarding URL and refreshes the payments status", async () => {
    const api = stubApi({ [`POST ${base}/payments/connect`]: json({ url: "https://stripe.test/onboard" }) });
    const view = renderApiHook(() => useConnectPayments(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(returnUrl));

    expect(api.last().body).toEqual(returnUrl);
    expect(view.invalidated()).toEqual(["payments"]);
  });
});
