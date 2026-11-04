import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert, Linking, Share, Text } from "react-native";
import { bookingDetail, bookingDetailSparse } from "@shared/api/__tests__/fixtures/bookings";
import { customerGroup } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { BookingDetail } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BookingPanel } from "./BookingDetailScreen";

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** A confirmed booking next week, paid in full online. */
const confirmed: BookingDetail = {
  ...bookingDetail,
  status: "confirmed",
  paymentStatus: "paid",
  start: future(7),
  end: new Date(Date.parse(future(7)) + 3_600_000).toISOString(),
  amountPaidCents: 5600,
  amountRefundedCents: 0,
  depositCents: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  checkoutUrl: null,
};

const path = `${B}/bookings/${bookingDetail.id}`;

function api(
  current: BookingDetail = bookingDetail,
  extra?: (m: string, p: string, body: unknown) => unknown,
) {
  return mockApi((method, p, body) => {
    const custom = extra?.(method, p, body);
    if (custom !== undefined) return custom;
    if (p === path && method === "GET") return current;
    if (p === `${B}/customer-groups`) return [customerGroup];
    return undefined;
  });
}

const panel = () => <BookingPanel bookingId={bookingDetail.id} />;

describe("BookingDetail", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });

  it("shows who, when, what was booked, the answers, notes and history of a cancelled booking", async () => {
    api();
    renderOpsScreen(panel());
    const view = await screen.findByTestId("booking-detail");
    expect(within(view).getAllByText("Rowan Example").length).toBeGreaterThan(0);
    expect(screen.getByText("Reference BA-7K3F9Q")).toBeOnTheScreen();
    // Cancelled by the customer, in the business's words, with when and why.
    expect(screen.getByText(/^Cancelled by the patient on .+\. “Feeling better”$/)).toBeOnTheScreen();
    expect(screen.getByText("This appointment is closed.")).toBeOnTheScreen();
    expect(screen.queryByTestId("cancel-booking")).toBeNull();
    // The customer's group, once the groups load.
    expect(await screen.findByText("Members")).toBeOnTheScreen();
    // The service, its option, add-on, resources and buffers.
    expect(screen.getByText(/· Extended/)).toBeOnTheScreen();
    expect(screen.getByText("+ Taping (10 min)")).toBeOnTheScreen();
    expect(screen.getByText("+€10")).toBeOnTheScreen();
    expect(screen.getByText("Alex Morgan")).toBeOnTheScreen();
    expect(screen.getByText("Blocks 5 min before and 10 min after for preparation.")).toBeOnTheScreen();
    expect(screen.getByText(/^Booked via booking page on /)).toBeOnTheScreen();
    // Answers, the customer's note and the team's notes.
    expect(screen.getByText("Which knee?")).toBeOnTheScreen();
    expect(screen.getByText("Left")).toBeOnTheScreen();
    expect(screen.getByText("NOTE FROM THE PATIENT")).toBeOnTheScreen();
    expect(screen.getByText("Sore since Saturday's match.")).toBeOnTheScreen();
    expect(screen.getByTestId("internal-notes")).toHaveDisplayValue("Prefers mornings.");
    const history = screen.getByTestId("booking-history");
    expect(within(history).getByText("Cancelled")).toBeOnTheScreen();
    expect(within(history).getByText("“Feeling better”")).toBeOnTheScreen();
  });

  it("says simply that it was cancelled when there's nothing more to tell, and lists history newest first", async () => {
    api({
      ...bookingDetailSparse,
      status: "cancelled",
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      addons: [{ id: ids.addon, name: "Taping", extraMinutes: 0, priceCents: 0 }],
      answers: [],
      history: [
        ...bookingDetailSparse.history,
        {
          ...bookingDetailSparse.history[0]!,
          id: "e2",
          action: "booking.approved",
          occurredAt: "2026-10-02T09:00:00Z",
        },
      ],
    });
    renderOpsScreen(panel());
    expect(await screen.findByText("Cancelled.")).toBeOnTheScreen();
    expect(screen.getByText("Blocks 15 min after for preparation.")).toBeOnTheScreen();
    expect(screen.getByText("+ Taping")).toBeOnTheScreen();
    expect(screen.queryByText("ANSWERS")).toBeNull();
    expect(screen.queryByText("NOTE FROM THE PATIENT")).toBeNull();
    const history = screen.getByTestId("booking-history");
    const labels = within(history)
      .getAllByText(/^(Approved|Appointment created)$/)
      .map((t) => (t.props as { children: string }).children);
    expect(labels).toEqual(["Approved", "Appointment created"]);
    expect(within(history).getAllByText(/^Automatic · /)).toHaveLength(2);
  });

  it("reaches the customer by phone, message and email, and opens their profile", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    api(confirmed);
    const app = renderOpsScreen(panel(), {
      routes: { "dashboard/[slug]/customers/[id]": () => <Text>Profile</Text> },
    });
    await screen.findByTestId("booking-detail");
    fireEvent.press(screen.getByRole("button", { name: /Call/ }));
    fireEvent.press(screen.getByRole("button", { name: /Message/ }));
    fireEvent.press(screen.getByRole("button", { name: /rowan@example.test/ }));
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      "tel:+353855550199",
      "sms:+353855550199",
      "mailto:rowan@example.test",
    ]);
    fireEvent.press(screen.getByTestId("view-profile"));
    expect(await screen.findByText("Profile")).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/dashboard/lumen-physio/customers/${ids.customer}`);
  });

  it("says when there's no way to reach the customer, and no history", async () => {
    api({ ...bookingDetailSparse, history: [] });
    renderOpsScreen(panel());
    expect(await screen.findByText("No contact details")).toBeOnTheScreen();
    expect(screen.queryByTestId("booking-history")).toBeNull();
  });

  it("keeps sensitive answers hidden until shown", async () => {
    api({
      ...confirmed,
      answers: [
        { questionId: ids.question, label: "Which knee?", value: "Left", sensitive: false },
        { questionId: ids.question2, label: "Medical history", value: "", sensitive: true },
      ],
    });
    renderOpsScreen(panel());
    expect(await screen.findByLabelText("Hidden")).toBeOnTheScreen();
    expect(screen.getByText("Never emailed or shared with AI.")).toBeOnTheScreen();
    expect(screen.queryByText("—")).toBeNull();
    fireEvent.press(screen.getByLabelText("Show answer: Medical history"));
    expect(screen.getByText("—")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Hidden")).toBeNull();
    fireEvent.press(screen.getByLabelText("Hide answer: Medical history"));
    expect(screen.getByLabelText("Hidden")).toBeOnTheScreen();
  });

  describe("internal notes", () => {
    it("saves edited notes, and clears them when emptied", async () => {
      let current = confirmed;
      const bodies: unknown[] = [];
      const fetch = api(confirmed, (method, p, body) => {
        if (method === "PATCH" && p === path) {
          bodies.push(body);
          current = { ...current, internalNotes: (body as { internalNotes: string | null }).internalNotes };
          return current;
        }
        if (method === "GET" && p === path) return current;
        return undefined;
      });
      renderOpsScreen(panel());
      const notes = await screen.findByTestId("internal-notes");
      expect(screen.queryByTestId("save-notes")).toBeNull();
      fireEvent.changeText(notes, "Bring the knee brace");
      fireEvent.press(screen.getByTestId("save-notes"));
      expect(await screen.findByText("Notes saved")).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByTestId("save-notes")).toBeNull());
      await waitFor(() =>
        expect(screen.getByTestId("internal-notes")).toHaveDisplayValue("Bring the knee brace"),
      );

      fireEvent.changeText(screen.getByTestId("internal-notes"), "   ");
      fireEvent.press(screen.getByTestId("save-notes"));
      await waitFor(() => expect(bodies).toHaveLength(2));
      expect(bodies).toEqual([{ internalNotes: "Bring the knee brace" }, { internalNotes: null }]);
      expect(calls(fetch)).toContain(`PATCH ${path}`);
    });

    it("discards a draft", async () => {
      api(confirmed);
      renderOpsScreen(panel());
      fireEvent.changeText(await screen.findByTestId("internal-notes"), "Something else");
      fireEvent.press(screen.getByRole("button", { name: "Discard" }));
      expect(screen.getByTestId("internal-notes")).toHaveDisplayValue("Prefers mornings.");
      expect(screen.queryByTestId("save-notes")).toBeNull();
    });

    it("keeps the draft when saving failed", async () => {
      api(confirmed, (method) =>
        method === "PATCH" ? apiError(500, "INTERNAL", "Couldn't save notes") : undefined,
      );
      renderOpsScreen(panel());
      fireEvent.changeText(await screen.findByTestId("internal-notes"), "Draft");
      fireEvent.press(screen.getByTestId("save-notes"));
      expect(await screen.findByText("Couldn't save notes")).toBeOnTheScreen();
      expect(screen.getByTestId("internal-notes")).toHaveDisplayValue("Draft");
      expect(screen.getByTestId("save-notes")).toBeOnTheScreen();
    });
  });

  describe("payment", () => {
    it("shows the deal, deposit, what was paid and refunded, and each payment", async () => {
      api({
        ...bookingDetail,
        status: "confirmed",
        payments: [
          ...bookingDetail.payments,
          { ...bookingDetail.payments[0]!, id: "p2", kind: "refund", provider: "dev", amountCents: 500 },
          { ...bookingDetail.payments[0]!, id: "p3", provider: "in_person", status: "succeeded" },
        ],
      });
      renderOpsScreen(panel());
      const section = await screen.findByTestId("payment-section");
      expect(within(section).getByLabelText("Deal: 20% off: was €70")).toBeOnTheScreen();
      expect(within(section).getByLabelText("Price: €56")).toBeOnTheScreen();
      expect(within(section).getByLabelText("Deposit: €20")).toBeOnTheScreen();
      expect(within(section).getByLabelText("Paid: €20")).toBeOnTheScreen();
      expect(within(section).getByLabelText("Refunded: −€5")).toBeOnTheScreen();
      expect(within(section).getByLabelText("Outstanding: €36")).toBeOnTheScreen();
      expect(within(section).getByText("Charge · stripe · succeeded")).toBeOnTheScreen();
      expect(within(section).getByText("Refund · test payment · succeeded")).toBeOnTheScreen();
      expect(within(section).getByText("Charge · in person · succeeded")).toBeOnTheScreen();
      // Partially refunded: nothing to mark as paid in person.
      expect(screen.queryByTestId("mark-paid")).toBeNull();
    });

    it("shows a free booking with nothing due", async () => {
      api({
        ...bookingDetailSparse,
        priceCents: 0,
        amountPaidCents: 0,
        amountRefundedCents: 0,
        payments: [],
      });
      renderOpsScreen(panel());
      const section = await screen.findByTestId("payment-section");
      expect(within(section).getByLabelText("Price: Free")).toBeOnTheScreen();
      expect(within(section).queryByLabelText(/^Paid:/)).toBeNull();
      expect(within(section).queryByLabelText(/^Outstanding:/)).toBeNull();
    });

    it("marks what's due at the venue as paid in person, once confirmed", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
      const atVenue: BookingDetail = {
        ...confirmed,
        paymentStatus: "pay_at_venue",
        amountPaidCents: 0,
        payments: [],
      };
      const fetch = api(atVenue, (method, p) =>
        method === "POST" && p === `${path}/paid-in-person`
          ? { ...atVenue, paymentStatus: "paid", amountPaidCents: 5600 }
          : undefined,
      );
      renderOpsScreen(panel());
      expect(await screen.findByLabelText("Due at venue: €56")).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId("mark-paid"));
      expect(alert).toHaveBeenCalledWith(
        "Mark €56 as paid in person?",
        expect.stringContaining("paid at the venue"),
        expect.any(Array),
      );
      const buttons = alert.mock.calls[0]![2]!;
      expect(buttons.map((b) => b.text)).toEqual(["Cancel", "Mark as paid"]);
      buttons[1]!.onPress!();
      expect(await screen.findByText("€56 marked as paid in person")).toBeOnTheScreen();
      expect(calls(fetch)).toContain(`POST ${path}/paid-in-person`);
    });

    it("says when marking as paid failed", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
      api({ ...confirmed, paymentStatus: "pay_at_venue", amountPaidCents: 0 }, (method) =>
        method === "POST" ? apiError(409, "CONFLICT", "Already paid") : undefined,
      );
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("mark-paid"));
      alert.mock.calls[0]![2]![1]!.onPress!();
      expect(await screen.findByText("Already paid")).toBeOnTheScreen();
    });
  });

  describe("held for payment", () => {
    const held: BookingDetail = {
      ...confirmed,
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: future(1),
      checkoutUrl: "https://checkout.stripe.test/c/pay_1",
    };

    it("says how long the slot is held, and shares the payment link", async () => {
      const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      api(held);
      renderOpsScreen(panel());
      expect(await screen.findByText(/^Waiting for payment\. The slot is held until /)).toBeOnTheScreen();
      const card = screen.getByTestId("payment-link");
      expect(
        within(card).getByText("The patient pays online with this link to confirm the appointment."),
      ).toBeOnTheScreen();
      expect(within(card).getByText(held.checkoutUrl!)).toBeOnTheScreen();
      fireEvent.press(within(card).getByRole("button", { name: "Share payment link" }));
      expect(share).toHaveBeenCalledWith({ message: held.checkoutUrl, url: held.checkoutUrl });
    });

    it("emails the payment link again", async () => {
      const fetch = api(held, (method, p) =>
        method === "POST" && p === `${path}/send-payment-link`
          ? { checkoutUrl: held.checkoutUrl, sentTo: "rowan@example.test" }
          : undefined,
      );
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("resend-payment-link"));
      expect(await screen.findByText("Payment link sent to rowan@example.test")).toBeOnTheScreen();
      expect(calls(fetch)).toContain(`POST ${path}/send-payment-link`);
    });

    it("says when the link couldn't be sent", async () => {
      api(held, (method) => (method === "POST" ? apiError(502, "EMAIL_FAILED", "Email is down") : undefined));
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("resend-payment-link"));
      expect(await screen.findByText("Email is down")).toBeOnTheScreen();
    });

    it("can only be shared when there's no email address", async () => {
      api({ ...held, customer: { ...held.customer, email: null } });
      renderOpsScreen(panel());
      expect(
        await screen.findByText("No email address on file, so share the link directly."),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId("resend-payment-link")).toBeNull();
    });
  });

  it("says when the booking isn't available", async () => {
    mockApi((_m, p) => (p === path ? apiError(404, "NOT_FOUND", "Not found") : undefined));
    renderOpsScreen(panel());
    expect(await screen.findByTestId("booking-unavailable")).toBeOnTheScreen();
    expect(screen.getByText("This appointment isn't available")).toBeOnTheScreen();
  });
});
