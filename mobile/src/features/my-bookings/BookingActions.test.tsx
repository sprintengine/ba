import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { customerBooking } from "@shared/api/__tests__/fixtures/bookings";
import { me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { CustomerBooking, MyBookings } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { availabilityWith, slotAt, tomorrow } from "~/test/customer";
import { renderScreen } from "~/test/render";
import { BookingDetail } from "./BookingDetail";
import { MyBookingsList } from "./MyBookingsList";

const mockCalendar = { createEventInCalendarAsync: jest.fn(), requestCalendarPermissionsAsync: jest.fn() };
jest.mock("expo-calendar/legacy", () => mockCalendar);

function upcoming(patch: Partial<CustomerBooking> = {}): CustomerBooking {
  const slot = slotAt(tomorrow(), "10:00");
  return { ...customerBooking, start: slot.start, end: slot.end, ...patch };
}

const ME = `/v1/me/bookings/${customerBooking.id}`;

describe("BookingDetail actions", () => {
  it("reschedules one of my bookings to another of its free times", async () => {
    const moved: unknown[] = [];
    const api = mockApi((method, path, body) => {
      if (path === `${ME}/availability`) return availabilityWith(["10:00", "16:00"]);
      if (method === "POST" && path === `${ME}/reschedule`) {
        moved.push(body);
        return upcoming({ start: slotAt(tomorrow(), "16:00").start });
      }
      if (path === "/v1/me/bookings") return { upcoming: [upcoming()], past: [] } satisfies MyBookings;
      return undefined;
    });
    renderScreen(<BookingDetail booking={upcoming()} />);
    fireEvent.press(screen.getByTestId("booking-reschedule"));
    fireEvent.press(await screen.findByTestId("slot-16:00"));
    fireEvent.press(screen.getByTestId("reschedule-confirm"));
    await waitFor(() => expect(moved).toEqual([{ start: slotAt(tomorrow(), "16:00").start }]));
    expect(calls(api)).toContain(`GET ${ME}/availability`);
    expect(await screen.findByText(/^Moved to /)).toBeOnTheScreen();
  });

  it("cancels with the refund preview", async () => {
    const api = mockApi((method, path) => {
      if (method === "POST" && path === `${ME}/cancel`) return upcoming({ status: "cancelled" });
      if (path === "/v1/me/bookings") return { upcoming: [], past: [] };
      return undefined;
    });
    renderScreen(<BookingDetail booking={upcoming()} />);
    fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByTestId("refund-preview")).toHaveTextContent("You'll get a full refund of €15.");
    fireEvent.press(screen.getByTestId("cancel-confirm"));
    expect(
      await screen.findByText("Initial assessment with Lumen Physiotherapy was cancelled"),
    ).toBeOnTheScreen();
    expect(calls(api)).toContain(`POST ${ME}/cancel`);
  });

  it("pays a held booking: Checkout, then reads My bookings again", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({ type: "dismiss" } as never);
    const held = upcoming({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    const api = mockApi((method, path) => {
      if (method === "POST" && path === `${ME}/pay`)
        return { checkoutUrl: "https://checkout.stripe.test/c/2" };
      if (path === "/v1/me/bookings") return { upcoming: [held], past: [] };
      return undefined;
    });
    renderScreen(<BookingDetail booking={held} />);
    expect(screen.getByText(/^Held for \d+:\d\d\. Pay now to confirm it\.$/)).toBeOnTheScreen();
    expect(screen.queryByTestId("booking-calendar")).toBeNull();
    fireEvent.press(screen.getByTestId("booking-pay"));
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        "https://checkout.stripe.test/c/2",
        expect.anything(),
      ),
    );
    await waitFor(() => expect(calls(api)).toContain("GET /v1/me/bookings"));
  });

  it("says why paying failed", async () => {
    mockApi((method, path) =>
      method === "POST" && path === `${ME}/pay`
        ? apiError(409, "CONFLICT", "The hold has expired.")
        : undefined,
    );
    const held = upcoming({ status: "held", holdExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    renderScreen(<BookingDetail booking={held} />);
    fireEvent.press(screen.getByTestId("booking-pay"));
    expect(await screen.findByText("The hold has expired.")).toBeOnTheScreen();
  });

  it("adds to the calendar", async () => {
    mockCalendar.createEventInCalendarAsync.mockResolvedValue({ action: "saved" });
    mockApi(() => undefined);
    renderScreen(<BookingDetail booking={upcoming()} />);
    fireEvent.press(screen.getByTestId("booking-calendar"));
    expect(await screen.findByText("Added to your calendar")).toBeOnTheScreen();
  });

  it("offers to book again once it's over", async () => {
    mockApi(() => undefined);
    const app = renderScreen(<BookingDetail booking={{ ...customerBooking, status: "completed" }} />, {
      routes: { "[slug]/index": () => <></> },
    });
    fireEvent.press(screen.getByTestId("book-again"));
    await waitFor(() => expect(app.getPathname()).toBe("/lumen-physio"));
  });
});

describe("My bookings list extras", () => {
  it("shows a pending team invitation, and the businesses to book again with", async () => {
    mockApi((_m, path) => {
      if (path === "/v1/me")
        return {
          ...meFixture,
          pendingInvitations: [{ token: "inv1", businessName: "Gleam Car Wash", role: "staff" }],
        };
      if (path === "/v1/me/bookings")
        return { upcoming: [], past: [{ ...customerBooking, status: "completed" }] };
      return undefined;
    });
    renderScreen(<MyBookingsList onOpen={jest.fn()} />);
    expect(await screen.findByText("You're invited to join Gleam Car Wash")).toBeOnTheScreen();
    expect(await screen.findByText("Book again with")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Lumen Physiotherapy" })).toBeOnTheScreen();
  });
});
