import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingDetail } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { BookingDrawer } from "../booking/booking-drawer";
import { auditEvent, bookingDetail, payment, requestBody, requests } from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

const LINK = "http://localhost:3000/dev/checkout/pay-1";

function held(patch: Partial<BookingDetail> = {}): BookingDetail {
  return bookingDetail({
    ...booking({
      status: "held",
      paymentStatus: "pending",
      source: "dashboard",
      amountPaidCents: 0,
      holdExpiresAt: "2099-10-01T08:30:00+01:00",
    }),
    checkoutUrl: LINK,
    ...patch,
  });
}

/** Serve [detail] for the booking, no customer groups, and whatever [extra] answers. */
function serve(
  detail: BookingDetail,
  extra: (method: string, path: string, body: unknown) => unknown = () => {},
) {
  return mockApi((method, path, body) => {
    const answer = extra(method, path, body);
    if (answer !== undefined) return answer;
    if (path.endsWith("/customer-groups")) return [];
    if (path.endsWith("/bookings/bk1")) return detail;
    return {};
  });
}

const renderDrawer = (onOpenChange: (open: boolean) => void = () => {}) =>
  renderDashboard(<BookingDrawer bookingId="bk1" open onOpenChange={onOpenChange} />);

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

/** The `dl` row whose term is [label], as "label value". */
function moneyRow(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  return must(term.parentElement, `${label} row`).textContent;
}

describe("BookingDrawer states", () => {
  it("shows a loading skeleton with an accessible title until the booking arrives", async () => {
    let release: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith("/customer-groups")
          ? Promise.resolve(json([]))
          : new Promise<Response>((resolve) => (release = resolve)),
      ),
    );
    renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Appointment details" });
    expect(dialog.querySelector("[aria-busy]")).not.toBeNull();
    release(json(bookingDetail()));
    expect(await screen.findByRole("dialog", { name: "Alex Morgan" })).toBeInTheDocument();
  });

  it("says a booking that is gone or on someone else's calendar isn't available", async () => {
    mockApi((method, path) =>
      path.endsWith("/bookings/bk1") ? json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404) : [],
    );
    renderDrawer();
    expect(await screen.findByText("This appointment isn't available")).toBeInTheDocument();
  });

  it("shows the server's message with a retry for other errors", async () => {
    let fail = true;
    const api = mockApi((method, path) => {
      if (!path.endsWith("/bookings/bk1")) return [];
      return fail
        ? json({ error: { code: "INTERNAL", message: "Database is napping" } }, 500)
        : bookingDetail();
    });
    const user = userEvent.setup();
    renderDrawer();
    expect(await screen.findByText("Database is napping")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("dialog", { name: "Alex Morgan" })).toBeInTheDocument();
    expect(requests(api).filter((r) => r === "GET /v1/businesses/b1/bookings/bk1")).toHaveLength(2);
  });

  it("keeps showing the booking when a later refresh fails", async () => {
    let fail = false;
    const api = serve(bookingDetail(), (method, path) =>
      fail && path.endsWith("/bookings/bk1")
        ? json({ error: { code: "INTERNAL", message: "Bookings are down" } }, 500)
        : undefined,
    );
    renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(await within(drawer).findByRole("heading", { name: "Payment" })).toBeInTheDocument();
    fail = true;
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(requests(api).filter((r) => r.endsWith("/bookings/bk1"))).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Bookings are down")).not.toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: "Payment" })).toBeInTheDocument();
  });

  it("closes on Escape and has no accessibility violations", async () => {
    serve(bookingDetail({ history: [auditEvent()], payments: [payment()] }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDrawer(onOpenChange);
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    await expectNoAxeViolations(document.body);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("is a bottom drawer on small screens, with the same details and actions", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: true,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    serve(bookingDetail());
    renderDrawer();
    const drawer = await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(within(drawer).getByRole("heading", { name: "Payment" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: /reschedule/i })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it("copies the reference from its chip", async () => {
    serve(bookingDetail());
    const user = userEvent.setup(); // installs its own clipboard: stub after
    const writeText = stubClipboard();
    renderDrawer();
    await user.click(await screen.findByRole("button", { name: "Copy reference BA-TEST01" }));
    expect(writeText).toHaveBeenCalledWith("BA-TEST01");
    expect(toast.success).toHaveBeenCalledWith("Reference copied");
  });
});

describe("BookingDrawer details", () => {
  it("lists the customer, service, add-ons, buffers, answers, notes and history", async () => {
    serve(
      bookingDetail({
        customer: { id: "c1", name: "Alex Morgan", email: null, phone: "+353 1 234 5678", groupId: null },
        option: { id: "o1", name: "Long" },
        addons: [{ id: "a1", name: "Hot stones", extraMinutes: 15, priceCents: 1000 }],
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 5,
        customerNotes: "Running a bit late",
        answers: [
          { questionId: "q1", label: "Injury", value: "Left knee", sensitive: true },
          { questionId: "q2", label: "Referral", value: "", sensitive: false },
        ],
        history: [
          auditEvent({ id: "e1", action: "booking.created", occurredAt: "2026-09-01T10:00:00Z" }),
          auditEvent({
            id: "e2",
            action: "booking.rescheduled",
            actorType: "member",
            actorName: "Casey Lane",
            summary: { reason: "Clash" },
            occurredAt: "2026-09-02T10:00:00Z",
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });

    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/customers/c1",
    );
    expect(screen.getByRole("link", { name: /\+353 1 234 5678/ })).toHaveAttribute(
      "href",
      "tel:+353 1 234 5678",
    );
    expect(screen.getByText(/Follow-up/)).toHaveTextContent("Follow-up · Long");
    expect(screen.getByText(/Hot stones/)).toHaveTextContent("Hot stones (15 min)");
    expect(screen.getByText(/Blocks 10 min before and 5 min after/)).toBeInTheDocument();
    expect(screen.getByText(/Booked via booking page on/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Note from the patient" })).toBeInTheDocument();
    expect(screen.getByText("Running a bit late")).toBeInTheDocument();

    // A sensitive answer is hidden until shown; an empty one shows a dash.
    expect(screen.queryByText("Left knee")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("Left knee")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide answer" }));
    expect(screen.queryByText("Left knee")).not.toBeInTheDocument();

    // History: newest first, with who and why.
    const history = within(must(screen.getByRole("heading", { name: "History" }).closest("section")));
    const items = history.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".font-medium")?.textContent)).toEqual([
      "Rescheduled",
      "Appointment created",
    ]);
    expect(must(items[0])).toHaveTextContent(/Casey Lane/);
    expect(must(items[0])).toHaveTextContent("“Clash”");
  });

  it("says when there are no contact details and shows the customer's group", async () => {
    serve(
      bookingDetail({
        customer: { id: "c1", name: "Alex Morgan", email: null, phone: null, groupId: "g1" },
      }),
      (method, path) =>
        path.endsWith("/customer-groups") ? [{ id: "g1", name: "Members", description: null }] : undefined,
    );
    renderDrawer();
    expect(await screen.findByText("No contact details")).toBeInTheDocument();
    expect(await screen.findByText("Members")).toBeInTheDocument();
  });

  it("explains a pending request and a cancellation", async () => {
    serve(bookingDetail({ status: "pending_approval", paymentStatus: "not_required" }));
    const { unmount } = renderDrawer();
    expect(await screen.findByText(/is told once you approve or decline/)).toHaveTextContent(
      "The patient is told once you approve or decline.",
    );
    unmount();

    serve(
      bookingDetail({
        status: "cancelled",
        cancelledBy: "customer",
        cancelledAt: "2099-09-10T12:00:00Z",
        cancellationReason: "Feeling better",
      }),
    );
    renderDrawer();
    const note = await screen.findByText(/Cancelled by the patient/);
    expect(note).toHaveTextContent(/on .*\./);
    expect(screen.getByText("“Feeling better”")).toBeInTheDocument();
  });

  it("shows how long a held booking waits for payment", async () => {
    serve(held());
    renderDrawer();
    expect(await screen.findByText(/Waiting for payment/)).toHaveTextContent(
      "Waiting for payment. The slot is held until 08:30.",
    );
  });
});

describe("BookingDrawer payment", () => {
  it("shows what is still owed: the price minus what was paid, not just the deposit", async () => {
    // A €70 booking with a €20 deposit of which nothing is paid yet: €70 is outstanding (amountDue), while the
    // customer is asked online for the €20 deposit (amountDueCents) — the drawer shows the business's view.
    serve(
      held({
        priceCents: 7000,
        depositCents: 2000,
        amountPaidCents: 0,
        payments: [payment({ status: "failed", amountCents: 2000 })],
      }),
    );
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(moneyRow("Price")).toBe("Price€70");
    expect(moneyRow("Deposit")).toBe("Deposit€20");
    expect(moneyRow("Outstanding")).toBe("Outstanding€70");
    expect(screen.queryByText("Paid", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.getByText(/Charge · Stripe · failed/)).toBeInTheDocument();
  });

  it("shows the booking's money in its own currency, not the business's", async () => {
    serve(
      bookingDetail({
        currency: "GBP",
        priceCents: 7000,
        amountPaidCents: 7000,
        payments: [payment({ amountCents: 7000, currency: "GBP" })],
      }),
    );
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(moneyRow("Price")).toBe("Price£70");
    expect(moneyRow("Paid")).toBe("Paid£70");
    expect(screen.getByText(/£70 · /)).toBeInTheDocument();
  });

  it("subtracts a paid deposit and labels the rest as due at the venue", async () => {
    serve(
      bookingDetail({
        priceCents: 7000,
        depositCents: 2000,
        amountPaidCents: 2000,
        paymentStatus: "pay_at_venue",
        payments: [payment({ amountCents: 2000, provider: "dev" })],
      }),
    );
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(moneyRow("Paid")).toBe("Paid€20");
    expect(moneyRow("Due at venue")).toBe("Due at venue€50");
    expect(screen.getByText(/Charge · test payment · succeeded/)).toBeInTheDocument();
  });

  it("shows refunds and nothing outstanding once cancelled", async () => {
    serve(
      bookingDetail({
        status: "cancelled",
        paymentStatus: "refunded",
        priceCents: 4500,
        amountPaidCents: 4500,
        amountRefundedCents: 4500,
        payments: [payment(), payment({ id: "pay2", kind: "refund" })],
      }),
    );
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(moneyRow("Refunded")).toBe("Refunded−€45");
    expect(screen.queryByText("Outstanding")).not.toBeInTheDocument();
    expect(screen.getByText(/Refund · Stripe · succeeded/).parentElement).toHaveTextContent("−€45");
  });

  it("strikes through the original price when a deal applied", async () => {
    serve(
      bookingDetail({
        priceCents: 4000,
        originalPriceCents: 5000,
        offer: {
          id: "o1",
          name: "Tuesday afternoons",
          label: "20% off",
          originalPriceCents: 5000,
          discountCents: 1000,
        },
        amountPaidCents: 4000,
      }),
    );
    renderDrawer();
    await screen.findByRole("dialog", { name: "Alex Morgan" });
    expect(screen.getByText(/Tuesday afternoons/)).toBeInTheDocument();
    expect(moneyRow("Price")).toMatch(/€50.*€40|€40.*€50/);
  });

  it("copies and resends the payment link of a held booking", async () => {
    const api = serve(held(), (method, path) =>
      path.endsWith("/send-payment-link") ? { checkoutUrl: LINK, sentTo: "alex@example.test" } : undefined,
    );
    const user = userEvent.setup();
    const writeText = stubClipboard();
    renderDrawer();

    expect(await screen.findByRole("textbox", { name: "Payment link" })).toHaveValue(LINK);
    await user.click(screen.getByRole("button", { name: /copy payment link/i }));
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(toast.success).toHaveBeenCalledWith("Payment link copied");
    await user.click(screen.getByRole("button", { name: /resend payment link/i }));
    await waitFor(() =>
      expect(requests(api)).toContain("POST /v1/businesses/b1/bookings/bk1/send-payment-link"),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Payment link sent to alex@example.test"));
  });

  it("explains when the link can't be copied or emailed", async () => {
    serve(held({ customer: { id: "c1", name: "Alex Morgan", email: null, phone: null, groupId: null } }));
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    renderDrawer();
    await user.click(await screen.findByRole("button", { name: /copy payment link/i }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Select the link and copy it instead.");
    expect(screen.getByText(/No email address on file/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend payment link/i })).not.toBeInTheDocument();
  });

  it("shows the server's message when resending fails", async () => {
    serve(held(), (method, path) =>
      path.endsWith("/send-payment-link")
        ? json({ error: { code: "RATE_LIMITED", message: "Slow down" } }, 429)
        : undefined,
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(await screen.findByRole("button", { name: /resend payment link/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slow down"));
  });

  it("shows no payment link once the booking is paid", async () => {
    serve(bookingDetail());
    renderDrawer();
    expect(await screen.findByRole("heading", { name: "Payment" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Payment link" })).not.toBeInTheDocument();
  });
});

describe("BookingDrawer internal notes", () => {
  it("saves edited notes with the button, and clears them to null", async () => {
    const api = serve(bookingDetail({ internalNotes: "Prefers mornings" }), (method, path, body) =>
      method === "PATCH" ? booking(body as object) : undefined,
    );
    const user = userEvent.setup();
    renderDrawer();
    const notes = await screen.findByRole("textbox", { name: "Internal notes" });
    expect(notes).toHaveValue("Prefers mornings");
    expect(screen.queryByRole("button", { name: "Save notes" })).not.toBeInTheDocument();

    await user.clear(notes);
    await user.type(notes, "   ");
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(requestBody(api, "/bookings/bk1", "PATCH")).toEqual({ internalNotes: null }));
    expect(toast.success).toHaveBeenCalledWith("Notes saved");
  });

  it("saves with ⌘↵ and discards a draft", async () => {
    const api = serve(bookingDetail(), (method, path, body) =>
      method === "PATCH" ? booking(body as object) : undefined,
    );
    const user = userEvent.setup();
    renderDrawer();
    const notes = await screen.findByRole("textbox", { name: "Internal notes" });

    await user.type(notes, "Bring the report");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(notes).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();

    await user.type(notes, "Bring the report");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() =>
      expect(requestBody(api, "/bookings/bk1", "PATCH")).toEqual({ internalNotes: "Bring the report" }),
    );
  });

  it("keeps the draft and shows the server's message when saving fails", async () => {
    serve(bookingDetail(), (method) =>
      method === "PATCH"
        ? json({ error: { code: "INVALID_REQUEST", message: "Notes are too long" } }, 400)
        : undefined,
    );
    const user = userEvent.setup();
    renderDrawer();
    const notes = await screen.findByRole("textbox", { name: "Internal notes" });
    await user.type(notes, "Long story");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Notes are too long"));
    expect(notes).toHaveValue("Long story");
  });
});

describe("BookingDrawer switching bookings", () => {
  it("doesn't carry an unsaved notes draft over to the next booking it shows", async () => {
    const other = bookingDetail({ ...booking({ id: "bk2" }), internalNotes: "Second booking's notes" });
    const api = mockApi((method, path, body) => {
      if (path.endsWith("/customer-groups")) return [];
      if (path.endsWith("/bookings/bk1"))
        return method === "PATCH" ? booking(body as object) : bookingDetail();
      if (path.endsWith("/bookings/bk2")) return method === "PATCH" ? booking(body as object) : other;
      return {};
    });
    const user = userEvent.setup();
    // The drawer stays open while ⌘K opens another booking.
    function Switching() {
      const [id, setId] = useState("bk2");
      return (
        <>
          <BookingDrawer bookingId={id} open onOpenChange={() => {}} />
          <button type="button" onClick={() => setId(id === "bk1" ? "bk2" : "bk1")}>
            Switch booking
          </button>
        </>
      );
    }
    renderDashboard(<Switching />);
    await screen.findByDisplayValue("Second booking's notes");
    const switchBooking = () =>
      fireEvent.click(screen.getByRole("button", { name: "Switch booking", hidden: true }));
    switchBooking();
    await user.type(await screen.findByRole("textbox", { name: "Internal notes" }), "First booking's draft");

    switchBooking();
    expect(await screen.findByRole("textbox", { name: "Internal notes" })).toHaveValue(
      "Second booking's notes",
    );
    expect(screen.queryByRole("button", { name: "Save notes" })).not.toBeInTheDocument();
    expect(requests(api).some((r) => r.startsWith("PATCH"))).toBe(false);
  });
});

describe("BookingDrawer actions", () => {
  it("offers the booking's actions in the footer", async () => {
    serve(bookingDetail({ status: "pending_approval", paymentStatus: "not_required", amountPaidCents: 0 }));
    renderDrawer();
    expect(await screen.findByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^decline$/i })).toBeInTheDocument();
  });
});
