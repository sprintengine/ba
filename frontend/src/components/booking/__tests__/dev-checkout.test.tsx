import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevPaymentInfo, ManagedBooking } from "@/lib/api/types";
import { business, managedBooking } from "@/lib/booking/__tests__/fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { DevCheckout } from "../dev-checkout";
import { apiError, pinNow, renderWithProviders, stubApi, type ApiRequest } from "./booking-test-utils";

// Now is 1 October 2026, 09:00 UTC; the hold lasts until 09:14:30.
beforeEach(() => pinNow());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function info({
  payment = {},
  booking = {},
}: { payment?: Partial<DevPaymentInfo["payment"]>; booking?: Partial<ManagedBooking> } = {}): DevPaymentInfo {
  return {
    payment: {
      id: "p1",
      kind: "charge",
      provider: "dev",
      amountCents: 1500,
      currency: "EUR",
      status: "pending",
      createdAt: "2026-10-01T09:00:00Z",
      ...payment,
    },
    booking: managedBooking({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      depositCents: 1500,
      holdExpiresAt: "2026-10-01T09:14:30Z",
      ...booking,
    }),
    business,
  };
}

function renderCheckout(payment: DevPaymentInfo | Response, route?: (req: ApiRequest) => unknown) {
  const requests = stubApi(
    (req) => route?.(req) ?? (req.path === "/v1/public/dev-payments/p1" ? payment : undefined),
  );
  return { requests, ...renderWithProviders(<DevCheckout paymentId="p1" />) };
}

describe("DevCheckout", () => {
  it("shows a loading state, then what is being paid for", async () => {
    const { container } = renderCheckout(info());
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Pay with card" })).toBeInTheDocument();
    expect(screen.getByText("Development payment — no real money is charged")).toBeInTheDocument();
    expect(screen.getAllByText("€15.00")).toHaveLength(2);
    expect(screen.getByText("Pay Lumen Physiotherapy")).toBeInTheDocument();
    expect(screen.getByText("Ref BA-7K3F9Q")).toBeInTheDocument();
    expect(screen.getByText(/Your time is held for/)).toHaveTextContent("Your time is held for 14:30.");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("alex.morgan@example.com");
    await expectNoAxeViolations(container);
  });

  it("completes the payment and follows the provider's redirect", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { requests } = renderCheckout(info(), (req) =>
      req.method === "POST" ? { redirectUrl: "/manage/tok?payment=succeeded" } : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "Pay €15.00" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/manage/tok?payment=succeeded"));
    const post = must(
      requests.find((r) => r.method === "POST"),
      "complete request",
    );
    expect(post.path).toBe("/v1/public/dev-payments/p1/complete");
    expect(post.body).toEqual({ outcome: "succeeded" });
    // Both choices stay disabled while leaving.
    expect(screen.getByRole("button", { name: "Cancel and return" })).toBeDisabled();
  });

  it("cancels and returns", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { requests } = renderCheckout(info(), (req) =>
      req.method === "POST" ? { redirectUrl: "/manage/tok?payment=cancelled" } : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "Cancel and return" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/manage/tok?payment=cancelled"));
    expect(must(requests.find((r) => r.method === "POST")).body).toEqual({ outcome: "cancelled" });
  });

  it("shows why completing failed and lets the customer try again", async () => {
    const user = userEvent.setup();
    renderCheckout(info(), (req) =>
      req.method === "POST" ? apiError(409, "CONFLICT", "This payment was already completed.") : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "Pay €15.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This payment was already completed.");
    expect(screen.getByRole("button", { name: "Pay €15.00" })).toBeEnabled();
  });

  it("says a paid checkout is complete", async () => {
    renderCheckout(info({ payment: { status: "succeeded" }, booking: { status: "confirmed" } }));
    expect(await screen.findByRole("heading", { name: "This payment is complete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Lumen Physiotherapy" })).toHaveAttribute(
      "href",
      "/lumen-physio",
    );
    expect(screen.queryByRole("button", { name: /Pay/ })).not.toBeInTheDocument();
  });

  it("says an expired checkout has expired", async () => {
    renderCheckout(info({ booking: { status: "expired" } }));
    expect(await screen.findByRole("heading", { name: "This checkout has expired" })).toBeInTheDocument();
  });

  it("treats a held booking whose hold has run out as expired", async () => {
    renderCheckout(info({ booking: { holdExpiresAt: "2026-10-01T08:59:00Z" } }));
    expect(await screen.findByRole("heading", { name: "This checkout has expired" })).toBeInTheDocument();
  });

  it("closes a checkout for a booking that is no longer held", async () => {
    renderCheckout(info({ booking: { status: "cancelled" } }));
    expect(await screen.findByRole("heading", { name: "This checkout is closed" })).toBeInTheDocument();
  });

  it("explains an unknown payment", async () => {
    renderCheckout(apiError(404, "NOT_FOUND", "Not found."));
    expect(await screen.findByText("Payment not found")).toBeInTheDocument();
  });

  it("shows other errors with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    renderCheckout(info(), () =>
      fail ? apiError(500, "INTERNAL", "The payment service failed.") : undefined,
    );
    expect(await screen.findByText("The payment service failed.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Pay with card" })).toBeInTheDocument();
  });
});
