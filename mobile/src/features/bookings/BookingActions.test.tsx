import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { bookingDetail } from "@shared/api/__tests__/fixtures/bookings";
import { customerGroup } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { BookingDetail } from "@shared/api/types";
import { addDaysToPlainDate, todayInTz, zonedToIso } from "@shared/format";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BookingPanel } from "./BookingDetailScreen";

const TZ = "Europe/Dublin";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Confirmed, next week-ish, €56 of which €20 paid online and €5 refunded (€15 refundable). */
const day = addDaysToPlainDate(todayInTz(TZ), 3);
const upcoming: BookingDetail = {
  ...bookingDetail,
  status: "confirmed",
  start: zonedToIso(day, "10:00", TZ),
  end: zonedToIso(day, "11:00", TZ),
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  checkoutUrl: null,
};
/** Confirmed and under way. */
const started: BookingDetail = {
  ...upcoming,
  start: iso(Date.now() - HOUR / 2),
  end: iso(Date.now() + HOUR / 2),
};
const pendingApproval: BookingDetail = { ...upcoming, status: "pending_approval" };
const unpaid: BookingDetail = {
  ...upcoming,
  paymentStatus: "pay_at_venue",
  amountPaidCents: 0,
  amountRefundedCents: 0,
};

const path = `${B}/bookings/${bookingDetail.id}`;
const slotStart = zonedToIso(day, "11:00", TZ);

function api(current: BookingDetail, extra?: (m: string, p: string, body: unknown) => unknown) {
  return mockApi((method, p, body) => {
    const custom = extra?.(method, p, body);
    if (custom !== undefined) return custom;
    if (p === path && method === "GET") return current;
    if (p === `${B}/customer-groups`) return [customerGroup];
    if (p === `${B}/availability`) {
      return {
        timezone: TZ,
        from: day,
        to: addDaysToPlainDate(day, 6),
        durationMinutes: 60,
        nextAvailableOnly: false,
        days: [
          {
            date: day,
            slots: [
              {
                start: slotStart,
                end: zonedToIso(day, "12:00", TZ),
                resourceIds: [ids.resource],
                seatsLeft: null,
                offer: null,
              },
            ],
            opensAt: null,
            held: false,
          },
        ],
      };
    }
    return undefined;
  });
}

/** Records the body of each `POST {path}{suffix}`, answering with `reply` (the booking by default). */
function recordPost(suffix: string, current: BookingDetail, reply?: unknown) {
  const bodies: unknown[] = [];
  const fetch = api(current, (method, p, body) => {
    if (method === "POST" && p === `${path}${suffix}`) {
      bodies.push(body);
      return reply ?? current;
    }
    return undefined;
  });
  return { bodies, fetch };
}

const panel = () => <BookingPanel bookingId={bookingDetail.id} />;

async function open(testID: string, sheet: string) {
  fireEvent.press(await screen.findByTestId(testID));
  return screen.findByTestId(sheet);
}

describe("BookingActionBar", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });

  it("offers to reschedule or cancel an upcoming booking, but not to record how it went", async () => {
    api(upcoming);
    renderOpsScreen(panel());
    expect(await screen.findByTestId("reschedule-booking")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel appointment" })).toBeOnTheScreen();
    expect(screen.queryByTestId("approve-booking")).toBeNull();
    expect(screen.queryByTestId("mark-completed")).toBeNull();
  });

  it("says there's nothing to do yet for a recorded outcome that hasn't started", async () => {
    api({ ...upcoming, status: "completed" });
    renderOpsScreen(panel());
    expect(await screen.findByText("No actions available yet.")).toBeOnTheScreen();
  });

  describe("recording how it went", () => {
    it("marks a booking under way as completed", async () => {
      const { bodies, fetch } = recordPost("/status", started, { ...started, status: "completed" });
      renderOpsScreen(panel());
      expect(await screen.findByTestId("mark-no-show")).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId("mark-completed"));
      expect(await screen.findByText("Marked as completed")).toBeOnTheScreen();
      expect(bodies).toEqual([{ status: "completed" }]);
      expect(calls(fetch)).toContain(`POST ${path}/status`);
    });

    it("rolls back a no-show that failed, and says why", async () => {
      api(started, (method) =>
        method === "POST" ? apiError(409, "CONFLICT", "Too early to mark") : undefined,
      );
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("mark-no-show"));
      expect(await screen.findByText("Too early to mark")).toBeOnTheScreen();
      expect(await screen.findByTestId("mark-completed")).toBeOnTheScreen();
    });

    it("corrects a completed booking to a no-show", async () => {
      const completed = { ...started, status: "completed" as const };
      const { bodies } = recordPost("/status", completed, { ...completed, status: "no_show" });
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByRole("button", { name: "Mark no-show instead" }));
      expect(await screen.findByText("Marked as no-show")).toBeOnTheScreen();
      expect(bodies).toEqual([{ status: "no_show" }]);
    });

    it("corrects a no-show to completed", async () => {
      const noShow = { ...started, status: "no_show" as const };
      const { bodies } = recordPost("/status", noShow, { ...noShow, status: "completed" });
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("correct-outcome"));
      expect(screen.getByRole("button", { name: "Mark completed instead" })).toBeOnTheScreen();
      expect(await screen.findByText("Marked as completed")).toBeOnTheScreen();
      expect(bodies).toEqual([{ status: "completed" }]);
    });
  });

  describe("a request waiting for approval", () => {
    it("keeps it pending when approving failed", async () => {
      api(pendingApproval, (method) =>
        method === "POST" ? apiError(409, "SLOT_UNAVAILABLE", "That time is taken") : undefined,
      );
      renderOpsScreen(panel());
      fireEvent.press(await screen.findByTestId("approve-booking"));
      expect(await screen.findByText("That time is taken")).toBeOnTheScreen();
      expect(await screen.findByTestId("approve-booking")).toBeOnTheScreen();
    });

    it("declines with a reason, saying the online payment is refunded", async () => {
      const { bodies } = recordPost("/decline", { ...pendingApproval, amountPaidInPersonCents: 0 });
      renderOpsScreen(panel());
      const sheet = await open("decline-booking", "decline-sheet");
      expect(within(sheet).getByText("Decline this appointment?")).toBeOnTheScreen();
      expect(
        within(sheet).getByText(
          /The patient is emailed and the time becomes free\. The €15 they paid online is refunded in full\.$/,
        ),
      ).toBeOnTheScreen();
      fireEvent.changeText(within(sheet).getByLabelText("Reason (optional)"), "  Fully booked that week ");
      fireEvent.press(within(sheet).getByTestId("confirm-decline"));
      expect(await screen.findByText("Appointment declined")).toBeOnTheScreen();
      expect(bodies).toEqual([{ reason: "Fully booked that week" }]);
      await waitFor(() => expect(screen.queryByTestId("decline-sheet")).toBeNull());
    });

    it("mentions money paid in person, and keeps the sheet open when declining failed", async () => {
      api(
        { ...pendingApproval, amountPaidCents: 3000, amountPaidInPersonCents: 1000, amountRefundedCents: 0 },
        (method) => (method === "POST" ? apiError(500, "INTERNAL", "Couldn't decline") : undefined),
      );
      renderOpsScreen(panel());
      const sheet = await open("decline-booking", "decline-sheet");
      expect(
        within(sheet).getByText(
          /€20 they paid online is refunded in full\. €10 paid in person isn't refunded online/,
        ),
      ).toBeOnTheScreen();
      fireEvent.press(within(sheet).getByTestId("confirm-decline"));
      expect(await screen.findByText("Couldn't decline")).toBeOnTheScreen();
      expect(screen.getByTestId("decline-sheet")).toBeOnTheScreen();
      fireEvent.press(within(sheet).getByRole("button", { name: "Keep request" }));
      await waitFor(() => expect(screen.queryByTestId("decline-sheet")).toBeNull());
    });
  });

  describe("cancelling", () => {
    it("lets a paid booking be cancelled with a chosen refund, a reason and no email", async () => {
      const { bodies } = recordPost("/cancel", upcoming, { ...upcoming, status: "cancelled" });
      renderOpsScreen(panel());
      const sheet = await open("cancel-booking", "cancel-sheet");
      const preview = within(sheet).getByTestId("refund-preview");
      // The policy refunds a business cancellation in full by default.
      expect(within(sheet).getByTestId("refund-policy")).toBeChecked();
      expect(within(sheet).getByLabelText(/^Follow your policy, .+, €15$/)).toBeOnTheScreen();
      expect(preview).toHaveTextContent(/refunds cancellations made by the business in full: €15/);
      fireEvent.press(within(sheet).getByTestId("refund-none"));
      expect(within(sheet).getByTestId("refund-none")).toBeChecked();
      expect(preview).toHaveTextContent("No refund. The €15 already paid online is kept.");
      fireEvent.press(within(sheet).getByTestId("refund-full"));
      expect(preview).toHaveTextContent("€15 will be refunded in full to the original payment method.");

      expect(within(sheet).getByText("Included in the email to the patient.")).toBeOnTheScreen();
      fireEvent(within(sheet).getByTestId("cancel-notify"), "valueChange", false);
      expect(within(sheet).getByText("Kept in the history.")).toBeOnTheScreen();
      fireEvent.changeText(within(sheet).getByLabelText("Reason (optional)"), "  Closing early ");
      fireEvent.press(within(sheet).getByTestId("confirm-cancel"));

      expect(await screen.findByText("Appointment cancelled. €15 refund on its way.")).toBeOnTheScreen();
      expect(bodies).toEqual([{ reason: "Closing early", refund: "full", notifyCustomer: false }]);
      await waitFor(() => expect(screen.queryByTestId("cancel-sheet")).toBeNull());
    });

    it("says no refund is due when cancelling without a refund", async () => {
      recordPost("/cancel", upcoming, { ...upcoming, status: "cancelled" });
      renderOpsScreen(panel());
      const sheet = await open("cancel-booking", "cancel-sheet");
      fireEvent.press(within(sheet).getByTestId("refund-none"));
      fireEvent.press(within(sheet).getByTestId("confirm-cancel"));
      expect(await screen.findByText("Appointment cancelled")).toBeOnTheScreen();
    });

    it("offers no refund choice when nothing was paid online", async () => {
      const { bodies } = recordPost("/cancel", unpaid, { ...unpaid, status: "cancelled" });
      renderOpsScreen(panel());
      const sheet = await open("cancel-booking", "cancel-sheet");
      expect(within(sheet).queryByTestId("refund-policy")).toBeNull();
      expect(within(sheet).getByTestId("refund-preview")).toHaveTextContent(
        "Nothing has been paid online, so there's nothing to refund.",
      );
      expect(within(sheet).getByTestId("cancel-notify")).toHaveProp(
        "accessibilityHint",
        "Sends a cancellation email.",
      );
      fireEvent.press(within(sheet).getByTestId("confirm-cancel"));
      expect(await screen.findByText("Appointment cancelled")).toBeOnTheScreen();
      expect(bodies).toEqual([{ reason: null, refund: "none", notifyCustomer: true }]);
    });

    it("keeps the booking when cancelling failed, or when asked to", async () => {
      api(upcoming, (method) =>
        method === "POST" ? apiError(500, "INTERNAL", "Couldn't cancel") : undefined,
      );
      renderOpsScreen(panel());
      const sheet = await open("cancel-booking", "cancel-sheet");
      fireEvent.press(within(sheet).getByTestId("confirm-cancel"));
      expect(await screen.findByText("Couldn't cancel")).toBeOnTheScreen();
      expect(screen.getByTestId("cancel-sheet")).toBeOnTheScreen();
      fireEvent.press(within(sheet).getByRole("button", { name: "Keep appointment" }));
      await waitFor(() => expect(screen.queryByTestId("cancel-sheet")).toBeNull());
    });
  });

  describe("rescheduling", () => {
    it("moves it to a free time with the same therapist", async () => {
      const { bodies } = recordPost("/reschedule", upcoming);
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      expect(
        within(sheet).getByText(/^Rowan Example · Initial assessment \(Extended\) · currently /),
      ).toBeOnTheScreen();
      expect(within(sheet).getByRole("radio", { name: "Alex Morgan (same as now)" })).toBeChecked();
      expect(within(sheet).getByTestId("confirm-reschedule")).toBeDisabled();
      fireEvent.press(await within(sheet).findByTestId("slot-11:00"));
      expect(within(sheet).getByRole("button", { name: "Move to 11:00" })).toBeEnabled();
      fireEvent.press(within(sheet).getByTestId("confirm-reschedule"));
      expect(await screen.findByText(/^Moved to .+, 11:00$/)).toBeOnTheScreen();
      expect(bodies).toEqual([{ start: slotStart, resourceIds: [ids.resource], notifyCustomer: true }]);
      await waitFor(() => expect(screen.queryByTestId("reschedule-sheet")).toBeNull());
    });

    it("moves it to an exact time with any therapist, without emailing", async () => {
      const { bodies } = recordPost("/reschedule", upcoming);
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      fireEvent.press(within(sheet).getByRole("radio", { name: "Any available therapist" }));
      expect(within(sheet).getByRole("radio", { name: "Any available therapist" })).toBeChecked();
      fireEvent.press(within(sheet).getByRole("tab", { name: "Exact time" }));
      fireEvent.changeText(within(sheet).getByLabelText("Start time"), "14:30");
      fireEvent(within(sheet).getByLabelText("Email the patient"), "valueChange", false);
      fireEvent.press(within(sheet).getByRole("button", { name: "Move to 14:30" }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        start: zonedToIso(day, "14:30", TZ),
        resourceIds: null,
        notifyCustomer: false,
      });
    });

    it("keeps the same therapist for an exact time", async () => {
      const { bodies } = recordPost("/reschedule", upcoming);
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      fireEvent.press(within(sheet).getByRole("radio", { name: "Any available therapist" }));
      fireEvent.press(within(sheet).getByRole("radio", { name: "Alex Morgan (same as now)" }));
      fireEvent.press(within(sheet).getByRole("tab", { name: "Exact time" }));
      fireEvent.changeText(within(sheet).getByLabelText("Start time"), "9:15");
      fireEvent.press(within(sheet).getByTestId("confirm-reschedule"));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        start: zonedToIso(day, "09:15", TZ),
        resourceIds: [ids.resource],
        notifyCustomer: true,
      });
    });

    it("lets staff move it without choosing whose calendar", async () => {
      const { bodies } = recordPost("/reschedule", upcoming);
      renderOpsScreen(panel(), { role: "staff" });
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      fireEvent.press(await within(sheet).findByTestId("slot-11:00"));
      fireEvent.press(within(sheet).getByTestId("confirm-reschedule"));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({ start: slotStart, resourceIds: null, notifyCustomer: true });
    });

    it("asks for another time when the chosen one was just taken", async () => {
      api(upcoming, (method) =>
        method === "POST" ? apiError(409, "SLOT_UNAVAILABLE", "Slot unavailable") : undefined,
      );
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      fireEvent.press(await within(sheet).findByTestId("slot-11:00"));
      fireEvent.press(within(sheet).getByTestId("confirm-reschedule"));
      expect(await screen.findByText("That time was just taken. Pick another one.")).toBeOnTheScreen();
      expect(within(sheet).getByRole("button", { name: "Pick a time" })).toBeDisabled();
    });

    it("shows other failures as they are", async () => {
      api(upcoming, (method) =>
        method === "POST" ? apiError(500, "INTERNAL", "Couldn't move it") : undefined,
      );
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      fireEvent.press(await within(sheet).findByTestId("slot-11:00"));
      fireEvent.press(within(sheet).getByTestId("confirm-reschedule"));
      expect(await screen.findByText("Couldn't move it")).toBeOnTheScreen();
      expect(within(sheet).getByRole("button", { name: "Move to 11:00" })).toBeOnTheScreen();
    });

    it("starts from today for a booking already in the past, and clears the time when the day changes", async () => {
      const today = todayInTz(TZ);
      const tomorrow = addDaysToPlainDate(today, 1);
      api({ ...pendingApproval, start: iso(Date.now() - 50 * HOUR), end: iso(Date.now() - 49 * HOUR) });
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      expect(within(sheet).getByTestId(`date-${today}`)).toBeChecked();
      fireEvent.press(within(sheet).getByRole("tab", { name: "Exact time" }));
      fireEvent.changeText(within(sheet).getByLabelText("Start time"), "16:00");
      expect(within(sheet).getByTestId("confirm-reschedule")).toBeEnabled();
      fireEvent.press(within(sheet).getByTestId(`date-${tomorrow}`));
      expect(within(sheet).getByTestId(`date-${tomorrow}`)).toBeChecked();
      expect(within(sheet).getByRole("button", { name: "Move to 16:00" })).toBeOnTheScreen();
      fireEvent.press(within(sheet).getByRole("tab", { name: "Free times" }));
      expect(within(sheet).getByRole("button", { name: "Pick a time" })).toBeDisabled();
    });

    it("offers only any therapist when booked without one", async () => {
      api({ ...upcoming, resources: [] });
      renderOpsScreen(panel());
      const sheet = await open("reschedule-booking", "reschedule-sheet");
      expect(within(sheet).queryByRole("radio", { name: /same as now/ })).toBeNull();
      expect(within(sheet).queryByText("With")).toBeNull();
    });
  });
});
