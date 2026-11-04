import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { managedBooking } from "@shared/api/__tests__/fixtures/bookings";
import type { ManagedBooking } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { availabilityWith, business, slotAt, tomorrow } from "~/test/customer";
import { authState, renderScreen } from "~/test/render";
import { outcomeFromUrl, openCheckout } from "~/features/booking/checkout";
import { ManageBookingView } from "./ManageBookingView";
import { contextFromOutcome, heroContext } from "./manage-context";
import { addToCalendar, bookingCalendarEvent } from "./calendar";

const mockCalendar = {
  createEventInCalendarAsync: jest.fn(),
  requestCalendarPermissionsAsync: jest.fn(),
};
jest.mock("expo-calendar/legacy", () => mockCalendar);

const TOKEN = "mt_3s9Qk2";
const MANAGE = `/v1/public/manage/${TOKEN}`;

/** A booking tomorrow at 10:00, confirmed, as the manage link shows it. */
function upcoming(patch: Partial<ManagedBooking> = {}): ManagedBooking {
  const slot = slotAt(tomorrow(), "10:00");
  return { ...managedBooking, start: slot.start, end: slot.end, status: "confirmed", ...patch };
}

function setup(
  booking: () => unknown,
  extra: (method: string, path: string, body: unknown) => unknown = () => undefined,
) {
  return mockApi((method, path, body) => {
    if (method === "GET" && path === MANAGE) return booking();
    if (path === `/v1/public/businesses/${business.slug}`) return business;
    return extra(method, path, body);
  });
}

describe("ManageBookingView", () => {
  it("says you're booked right after booking, with the booking and its actions", async () => {
    setup(() => upcoming());
    renderScreen(<ManageBookingView token={TOKEN} context="booked" />, {
      auth: authState({ isSignedIn: false, user: null }),
    });
    expect(await screen.findByText("You're booked")).toBeOnTheScreen();
    expect(screen.getByText(/We've emailed the details to rowan@example\.test\./)).toBeOnTheScreen();
    expect(screen.getByTestId("manage-card")).toHaveTextContent(/Initial assessment/);
    expect(screen.getByTestId("manage-price")).toHaveTextContent(/€20 paid · €5 refunded/);
    expect(screen.getByTestId("save-link")).toBeOnTheScreen();
    // Signed out: an account keeps every booking in one place.
    expect(await screen.findByTestId("create-account")).toBeOnTheScreen();
  });

  it("cancels with the refund preview and a reason", async () => {
    let cancelled = false;
    const api = setup(
      () => upcoming(cancelled ? { status: "cancelled", canCancel: false, canReschedule: false } : {}),
      (method, path, body) => {
        if (method === "POST" && path === `${MANAGE}/cancel`) {
          cancelled = true;
          expect(body).toEqual({ reason: "Sick" });
          return upcoming({ status: "cancelled", canCancel: false, canReschedule: false });
        }
        return undefined;
      },
    );
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    fireEvent.press(await screen.findByTestId("cancel-booking"));
    expect(await screen.findByTestId("refund-preview")).toHaveTextContent("You'll get a full refund of €15.");
    fireEvent.changeText(screen.getByTestId("cancel-reason"), "Sick");
    fireEvent.press(screen.getByTestId("cancel-confirm"));
    expect(await screen.findByTestId("manage-hero-cancelled")).toBeOnTheScreen();
    expect(calls(api)).toContain(`POST ${MANAGE}/cancel`);
  });

  it("shows a cancellation's error in the sheet", async () => {
    setup(
      () => upcoming(),
      (method, path) =>
        method === "POST" && path === `${MANAGE}/cancel`
          ? apiError(409, "POLICY_VIOLATION", "Too late to cancel online.")
          : undefined,
    );
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    fireEvent.press(await screen.findByTestId("cancel-booking"));
    fireEvent.press(await screen.findByTestId("cancel-confirm"));
    expect(await screen.findByTestId("cancel-error")).toHaveTextContent("Too late to cancel online.");
  });

  it("reschedules to another free time", async () => {
    const moved: unknown[] = [];
    setup(
      () => upcoming(),
      (method, path, body) => {
        if (path === `${MANAGE}/availability`) return availabilityWith(["10:00", "15:00"]);
        if (method === "POST" && path === `${MANAGE}/reschedule`) {
          moved.push(body);
          return upcoming({ start: slotAt(tomorrow(), "15:00").start });
        }
        return undefined;
      },
    );
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    fireEvent.press(await screen.findByTestId("reschedule"));
    expect(await screen.findByTestId("reschedule-confirm")).toHaveAccessibleName("Choose a new time");
    fireEvent.press(await screen.findByTestId("slot-15:00"));
    expect(screen.getByTestId("reschedule-confirm")).toHaveAccessibleName(/^Move to .*, 15:00$/);
    fireEvent.press(screen.getByTestId("reschedule-confirm"));
    await waitFor(() => expect(moved).toEqual([{ start: slotAt(tomorrow(), "15:00").start }]));
  });

  it("when the new time was just taken, says so and refreshes the times", async () => {
    setup(
      () => upcoming(),
      (method, path) => {
        if (path === `${MANAGE}/availability`) return availabilityWith(["15:00"]);
        if (method === "POST" && path === `${MANAGE}/reschedule`)
          return apiError(409, "SLOT_UNAVAILABLE", "Taken.");
        return undefined;
      },
    );
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    fireEvent.press(await screen.findByTestId("reschedule"));
    fireEvent.press(await screen.findByTestId("slot-15:00"));
    fireEvent.press(screen.getByTestId("reschedule-confirm"));
    expect(await screen.findByTestId("reschedule-error")).toHaveTextContent(
      "That time was just taken. We've refreshed the available times.",
    );
  });

  it("pays a held booking through Checkout, then reads it again until paid", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({ type: "dismiss" } as never);
    let paid = false;
    const holdExpiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
    setup(
      () =>
        upcoming(paid ? {} : { status: "held", paymentStatus: "pending", amountPaidCents: 0, holdExpiresAt }),
      (method, path) => {
        if (method === "POST" && path === `${MANAGE}/pay`)
          return { checkoutUrl: "https://checkout.stripe.test/c/1" };
        return undefined;
      },
    );
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    expect(await screen.findByText("Complete your payment")).toBeOnTheScreen();
    expect(screen.getByText(/Your time is held for \d+:\d\d\./)).toBeOnTheScreen();
    paid = true;
    fireEvent.press(screen.getByTestId("manage-pay"));
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        "https://checkout.stripe.test/c/1",
        expect.anything(),
      ),
    );
    expect(await screen.findByText("You're booked and paid", undefined, { timeout: 5000 })).toBeOnTheScreen();
  });

  it("says when a link isn't valid any more", async () => {
    setup(() => apiError(404, "NOT_FOUND", "No such booking."));
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    expect(await screen.findByTestId("manage-not-found")).toBeOnTheScreen();
    expect(screen.getByText("This link isn't valid anymore")).toBeOnTheScreen();
  });

  it("shows other errors with a retry", async () => {
    setup(() => apiError(500, "INTERNAL_SERVER_ERROR", "Broke."));
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    expect(await screen.findByText("Broke.")).toBeOnTheScreen();
  });

  it("adds the booking to the calendar through the system's screen", async () => {
    mockCalendar.createEventInCalendarAsync.mockResolvedValue({ action: "saved" });
    setup(() => upcoming());
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    fireEvent.press(await screen.findByTestId("add-to-calendar"));
    expect(await screen.findByText("Added to your calendar")).toBeOnTheScreen();
    expect(mockCalendar.createEventInCalendarAsync).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Initial assessment · Lumen Physiotherapy" }),
    );
  });

  it("tells you to contact the business when it can't be changed online", async () => {
    setup(() => upcoming({ canCancel: false, canReschedule: false }));
    renderScreen(<ManageBookingView token={TOKEN} context={null} />);
    expect(
      await screen.findByText(/Need to change something\? Contact Lumen Physiotherapy directly/),
    ).toBeOnTheScreen();
  });
});

describe("checkout", () => {
  it("reads Stripe's outcome from the return address", () => {
    expect(outcomeFromUrl("https://bookanything.ie/manage/x?payment=succeeded")).toBe("succeeded");
    expect(outcomeFromUrl("https://bookanything.ie/manage/x?a=1&payment=cancelled")).toBe("cancelled");
    expect(outcomeFromUrl(null)).toBe("unknown");
  });

  it("uses the in-app browser when the website isn't https (development)", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({ type: "dismiss" } as never);
    await expect(openCheckout("https://checkout.test/1", "tok")).resolves.toBe("unknown");
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("maps outcomes to the view's context", () => {
    expect(contextFromOutcome("succeeded")).toBe("paid");
    expect(contextFromOutcome("cancelled")).toBe("payment_cancelled");
    expect(contextFromOutcome("unknown")).toBe("checking");
    expect(contextFromOutcome("checkout")).toBe("checkout");
    expect(contextFromOutcome(null)).toBeNull();
    expect(heroContext("checking")).toBe("paid");
    expect(heroContext("checkout")).toBeNull();
  });
});

describe("calendar", () => {
  it("builds the event like the website", () => {
    const event = bookingCalendarEvent(managedBooking, "https://bookanything.ie/manage/t");
    expect(event.title).toBe("Initial assessment · Lumen Physiotherapy");
    expect(event.location).toBe("Unit 4, Lantern Quay, Grand Canal Dock, Dublin, D02 X285");
    expect(event.notes).toBe(
      "Reference BA-7K3F9Q\nWith Alex Morgan\nManage: https://bookanything.ie/manage/t",
    );
  });

  it("asks for calendar access when the editor needs it (before iOS 17), and reports failures", async () => {
    mockCalendar.createEventInCalendarAsync
      .mockRejectedValueOnce(new Error("no access"))
      .mockResolvedValueOnce({ action: "done" });
    mockCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ granted: true });
    await expect(addToCalendar(managedBooking)).resolves.toBe("done");
    mockCalendar.createEventInCalendarAsync.mockRejectedValue(new Error("no access"));
    mockCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ granted: false });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(addToCalendar(managedBooking)).resolves.toBe("failed");
    await act(async () => undefined);
  });
});
