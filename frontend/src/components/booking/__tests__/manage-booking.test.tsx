import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedBooking } from "@/lib/api/types";
import { business, managedBooking } from "@/lib/booking/__tests__/fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { Toaster } from "@/components/ui/toast";
import { ManageBookingPage } from "../manage-booking";
import {
  apiError,
  availabilityFor,
  calls,
  NOW,
  pinNow,
  renderWithProviders,
  slotAt,
  stubApi,
  type ApiRequest,
} from "./booking-test-utils";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/manage/tok",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const auth = vi.hoisted(() => ({ isSignedIn: true }));
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: auth.isSignedIn,
    user: null,
    getToken: async () => null,
    signOut: async () => {},
    mode: "dev",
  }),
}));

// Now is Thursday 1 October 2026, 10:00 in Dublin; the fixture booking is Thursday 8 October, 10:00–11:00.
beforeEach(() => {
  pinNow();
  nav.search = "";
  auth.isSignedIn = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage(booking: ManagedBooking | Response, route?: (req: ApiRequest) => unknown) {
  const requests = stubApi((req) => {
    const custom = route?.(req);
    if (custom !== undefined) return custom;
    if (req.path === "/v1/public/manage/tok") return booking;
    if (req.path === `/v1/public/businesses/${business.slug}`) return business;
    return undefined;
  });
  const view = renderWithProviders(
    <>
      <ManageBookingPage token="tok" />
      <Toaster />
    </>,
  );
  return { requests, ...view };
}

/** The booking card, once the business (and its word for a booking) has loaded. */
const bookingCard = () => screen.findByRole("region", { name: "Your appointment" });

describe("ManageBookingPage loading and errors", () => {
  it("shows a loading state until the booking arrives", async () => {
    const { container } = renderPage(managedBooking());
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    expect(await screen.findByText("BA-7K3F9Q")).toBeInTheDocument();
  });

  it("explains an invalid link and offers to sign in", async () => {
    const { container } = renderPage(apiError(404, "NOT_FOUND", "Not found."));
    expect(
      await screen.findByRole("heading", { level: 1, name: "This booking link isn't valid" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to see your bookings" })).toHaveAttribute(
      "href",
      "/my/bookings",
    );
    // No business to brand the page with: bookanything's logo, not a placeholder loading forever, and no footer.
    expect(screen.getByRole("link", { name: "bookanything" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows other errors with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    renderPage(managedBooking(), (req) =>
      fail && req.path === "/v1/public/manage/tok"
        ? apiError(500, "INTERNAL", "Something broke on our side.")
        : undefined,
    );
    expect(await screen.findByText("Something broke on our side.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("BA-7K3F9Q")).toBeInTheDocument();
  });
});

describe("ManageBookingPage headline", () => {
  it("celebrates a fresh booking, offers its actions and to save the link", async () => {
    nav.search = "booked=1";
    const user = userEvent.setup();
    renderPage(managedBooking());
    expect(await screen.findByRole("heading", { level: 1, name: "You're booked" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /We've emailed the details to alex.morgan@example.com\. See you on Thursday,? 8 October\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reschedule/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Cancel appointment/ })).toBeInTheDocument();

    expect(screen.getByText("This page is your appointment link")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/manage/tok`);
    await expectNoAxeViolations(document.body);
  });

  it("says when the link couldn't be copied", async () => {
    nav.search = "booked=1";
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    renderPage(managedBooking());
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(
      await screen.findByText("Couldn't copy. Select the address bar and copy the link instead."),
    ).toBeInTheDocument();
  });

  it("has a page heading on a plain revisit, when there is nothing to announce", async () => {
    renderPage(managedBooking());
    expect(await screen.findByRole("heading", { level: 1, name: "Your appointment" })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it("asks to pay a held booking, counting down the hold", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const held = managedBooking({
      status: "held",
      paymentStatus: "pending",
      depositCents: 1500,
      amountPaidCents: 0,
      holdExpiresAt: "2026-10-01T09:14:30Z",
    });
    const { requests } = renderPage(held, (req) =>
      req.method === "POST" && req.path.endsWith("/pay")
        ? { checkoutUrl: "https://pay.example/cs_1" }
        : undefined,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Complete your payment" }),
    ).toBeInTheDocument();
    await bookingCard();
    expect(screen.getByText(/Your time is held for/)).toHaveTextContent(
      /^Your time is held for 14:30\. Complete payment to confirm your appointment\.$/,
    );
    // Not in calendars until it's paid.
    expect(screen.queryByRole("button", { name: /Add to calendar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay €15" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/cs_1"));
    expect(calls(requests)).toContain("POST /v1/public/manage/tok/pay");
  });

  it("says when starting the payment failed", async () => {
    nav.search = "payment=cancelled";
    const user = userEvent.setup();
    const held = managedBooking({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: "2026-10-01T09:20:00Z",
    });
    renderPage(held, (req) =>
      req.path.endsWith("/pay")
        ? apiError(409, "PAYMENTS_NOT_CONFIGURED", "Online payment is off.")
        : undefined,
    );
    expect(await screen.findByRole("heading", { name: "Payment not completed" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay €70" }));
    expect(await screen.findByText("Online payment is off.")).toBeInTheDocument();
  });

  it("says the hold ran out once the countdown reaches zero", async () => {
    renderPage(
      managedBooking({
        status: "held",
        paymentStatus: "pending",
        amountPaidCents: 0,
        holdExpiresAt: "2026-10-01T08:00:00Z",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Your hold has run out" })).toBeInTheDocument();
    // The hero's and the header's.
    for (const link of screen.getAllByRole("link", { name: "Book again" }))
      expect(link).toHaveAttribute("href", "/lumen-physio");
  });

  it("keeps checking after a payment until the booking is confirmed", async () => {
    nav.search = "payment=succeeded";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    let current = managedBooking({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: "2026-10-01T09:20:00Z",
    });
    renderPage(managedBooking(), (req) => (req.path === "/v1/public/manage/tok" ? current : undefined));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole("heading", { name: "Confirming your payment…" })).toBeInTheDocument();
    current = managedBooking();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole("heading", { name: "You're booked and paid" })).toBeInTheDocument();
  });

  it("confirms the payment it came back from at once", async () => {
    nav.search = "payment=succeeded&session_id=cs_test_1";
    const held = managedBooking({ status: "held", paymentStatus: "pending", amountPaidCents: 0 });
    const confirms: unknown[] = [];
    renderPage(held, (req) => {
      if (req.path === "/v1/public/manage/tok/payment/confirm") {
        confirms.push(req.body);
        return managedBooking();
      }
      return undefined;
    });
    expect(await screen.findByRole("heading", { name: "You're booked and paid" })).toBeInTheDocument();
    expect(confirms).toEqual([{ sessionId: "cs_test_1" }]);
  });

  it("stops checking after a minute and says the confirmation will come by email", async () => {
    nav.search = "payment=succeeded";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const held = managedBooking({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: "2026-10-01T09:20:00Z",
    });
    let reads = 0;
    renderPage(held, (req) => {
      if (req.path === "/v1/public/manage/tok") reads++;
      return req.path === "/v1/public/manage/tok" ? held : undefined;
    });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole("heading", { name: "Confirming your payment…" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(65_000));
    expect(screen.getByRole("heading", { name: "Still confirming your payment" })).toBeInTheDocument();
    expect(
      screen.getByText(/There's no need to pay again: we'll email alex.morgan@example.com/),
    ).toBeInTheDocument();
    const after = reads;
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(reads).toBe(after);
  });

  it("explains a request waiting for approval", async () => {
    renderPage(managedBooking({ status: "pending_approval", paymentStatus: "not_required" }));
    expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
    expect(
      screen.getByText(/Lumen Physiotherapy reviews each request\. We'll email alex.morgan@example.com/),
    ).toBeInTheDocument();
  });

  it("shows a cancellation with its refund and a way to book again", async () => {
    const { container } = renderPage(
      managedBooking({
        status: "cancelled",
        paymentStatus: "refunded",
        amountRefundedCents: 7000,
        canCancel: false,
        canReschedule: false,
      }),
    );
    expect(await screen.findByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
    expect(screen.getByText(/€70 is on its way back to your card/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book another time" })).toHaveAttribute("href", "/lumen-physio");
    const card = within(await bookingCard());
    expect(card.getByText("Price").nextElementSibling).toHaveTextContent("€70 · €70 paid · €70 refunded");
    expect(card.queryByRole("button")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("thanks the customer after the appointment", async () => {
    renderPage(managedBooking({ status: "completed", canCancel: false, canReschedule: false }));
    expect(await screen.findByRole("heading", { name: "This has passed" })).toBeInTheDocument();
    expect(await screen.findByText("Thanks for booking with Lumen Physiotherapy.")).toBeInTheDocument();
  });

  it("shows an expired hold without a stale payment badge", async () => {
    // The backend expires the hold but leaves its unpaid charge "pending".
    renderPage(
      managedBooking({ status: "expired", paymentStatus: "pending", amountPaidCents: 0, canCancel: false }),
    );
    expect(await screen.findByRole("heading", { name: "This hold expired" })).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Payment pending")).not.toBeInTheDocument();
  });
});

describe("the booking card", () => {
  it("shows the deal price, what was paid, where and the reference", async () => {
    renderPage(
      managedBooking({
        originalPriceCents: 8000,
        priceCents: 6400,
        amountPaidCents: 6400,
        offer: {
          id: "of1",
          name: "Quiet mornings",
          label: "20% off",
          originalPriceCents: 8000,
          discountCents: 1600,
        },
        option: { id: "o2", name: "60 minutes" },
        addons: [{ id: "a1", name: "Cupping" }],
      }),
    );
    const card = within(await bookingCard());
    expect(card.getByRole("heading", { level: 2 })).toHaveTextContent("Initial assessment · 60 minutes");
    expect(card.getByText("+ Cupping")).toBeInTheDocument();
    expect(card.getByText("was €80, now €64")).toBeInTheDocument();
    expect(card.getByText(/€64 paid/)).toBeInTheDocument();
    expect(card.getByText("20% off")).toBeInTheDocument();
    expect(card.getByText("Quiet mornings")).toBeInTheDocument();
    const where = card.getByRole("link", { name: "Unit 4, Lantern Quay, Dublin" });
    expect(where).toHaveAttribute("target", "_blank");
    expect(new URL(must(where.getAttribute("href"))).searchParams.get("query")).toBe(
      "Lumen Physiotherapy, Unit 4, Lantern Quay, Dublin",
    );
    expect(card.getByText("BA-7K3F9Q")).toBeInTheDocument();
  });

  it("says a paid deposit is a deposit, with the rest due at the appointment", async () => {
    renderPage(managedBooking({ depositCents: 2000, amountPaidCents: 2000 }));
    const card = within(await bookingCard());
    expect(card.getByText("Deposit paid")).toBeInTheDocument();
    expect(card.getByText("Price").nextElementSibling).toHaveTextContent(
      "€70 · €20 deposit paid · €50 due at your appointment",
    );
  });

  it("points to the business when the booking can't be changed online", async () => {
    renderPage(managedBooking({ canCancel: false, canReschedule: false }));
    expect(
      await screen.findByText(
        "Need to change something? Contact Lumen Physiotherapy directly on +353 1 555 0101.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeInTheDocument();
  });

  it("invites signed-out guests to create an account", async () => {
    auth.isSignedIn = false;
    renderPage(managedBooking());
    expect(await screen.findByText("Keep all your appointments in one place")).toBeInTheDocument();
    expect(screen.getByText(/Create a free account with alex.morgan@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create account/ })).toHaveAttribute(
      "href",
      "/sign-up?redirect_url=%2Fmy%2Fbookings",
    );
  });
});

describe("cancelling", () => {
  it("cancels after confirming", async () => {
    const user = userEvent.setup();
    const b = managedBooking();
    const { requests } = renderPage(b, (req) =>
      req.method === "POST" && req.path.endsWith("/cancel")
        ? { ...b, status: "cancelled", canCancel: false }
        : undefined,
    );
    await user.click(await screen.findByRole("button", { name: /Cancel appointment/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Cancel your appointment?" });
    expect(dialog).toHaveTextContent("You'll get a full refund of €70.");
    await expectNoAxeViolations(document.body);
    await user.click(within(dialog).getByRole("button", { name: /Cancel appointment/ }));
    await waitFor(() => expect(calls(requests)).toContain("POST /v1/public/manage/tok/cancel"));
    expect(must(requests.find((r) => r.path.endsWith("/cancel"))).body).toEqual({ reason: null });
    expect(await screen.findByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
    expect(await screen.findByText("Your appointment was cancelled")).toBeInTheDocument();
  });

  it("keeps the booking with Escape", async () => {
    const user = userEvent.setup();
    renderPage(managedBooking());
    const open = await screen.findByRole("button", { name: /Cancel appointment/ });
    await user.click(open);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    // Focus returns to the button that opened it.
    await waitFor(() => expect(open).toHaveFocus());
  });
});

describe("rescheduling", () => {
  const availability = (req: ApiRequest) =>
    req.path.endsWith("/availability") ? availabilityFor(req.query, (d) => [slotAt(d, "15:00")]) : undefined;

  it("moves the booking on its own availability and returns to it", async () => {
    const user = userEvent.setup();
    const b = managedBooking();
    const { requests } = renderPage(b, (req) =>
      req.method === "POST" && req.path.endsWith("/reschedule")
        ? { ...b, start: "2026-10-01T14:00:00Z", end: "2026-10-01T15:00:00Z" }
        : availability(req),
    );
    await user.click(await screen.findByRole("button", { name: /Reschedule/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Choose a new time" })).toBeInTheDocument();
    expect(screen.getByText(/Currently Thursday,? 8 October at 10:00/)).toBeInTheDocument();
    const times = await screen.findByRole("group", { name: "Available times" });
    await user.click(within(times).getByRole("button", { name: "15:00" }));
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("button", { name: /^Move to .*, 15:00$/ }));

    expect(await screen.findByText(/^Moved to .*, 15:00$/)).toBeInTheDocument();
    expect(await screen.findByText("BA-7K3F9Q")).toBeInTheDocument();
    expect(must(requests.find((r) => r.path.endsWith("/reschedule"))).body).toEqual({
      start: "2026-10-01T15:00:00+01:00",
    });
    expect(
      calls(requests)
        .filter((c) => c.endsWith("/availability"))
        .every((c) => c.includes("/manage/tok/")),
    ).toBe(true);
  });

  it("goes back to the booking without changing it", async () => {
    const user = userEvent.setup();
    renderPage(managedBooking(), availability);
    await user.click(await screen.findByRole("button", { name: /Reschedule/ }));
    await user.click(await screen.findByRole("button", { name: "Back to your appointment" }));
    expect(await screen.findByText("BA-7K3F9Q")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reschedule/ }));
    await user.click(await screen.findByRole("button", { name: "Keep current time" }));
    expect(await screen.findByText("BA-7K3F9Q")).toBeInTheDocument();
  });
});
