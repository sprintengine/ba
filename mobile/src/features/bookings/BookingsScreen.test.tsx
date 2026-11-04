import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { booking as bookingFixture, bookingDetail } from "@shared/api/__tests__/fixtures/bookings";
import { resource, service } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { Booking, BookingDetail } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BookingDetailScreen } from "./BookingDetailScreen";
import { BookingsScreen } from "./BookingsScreen";

const confirmed: Booking = {
  ...bookingFixture,
  status: "confirmed",
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
};
const pendingBooking: Booking = {
  ...confirmed,
  id: "00000000-0000-4000-8000-000000000601",
  reference: "BA-PEND01",
  status: "pending_approval",
  customer: { ...confirmed.customer, name: "Sam Pending" },
};
const detailOf = (b: Booking): BookingDetail => ({ ...bookingDetail, ...b, checkoutUrl: null });

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1180 : 390, height: 820 });
}

function api(
  items: Booking[] = [confirmed, pendingBooking],
  extra?: (m: string, p: string, body: unknown) => unknown,
) {
  return mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === `${B}/bookings` && method === "GET") return { items, nextCursor: null };
    if (path === `${B}/resources`)
      return [resource, { ...resource, id: ids.resource2, name: "Jordan Casey" }];
    if (path === `${B}/services`) return [service, { ...service, id: "s2", name: "Follow-up" }];
    if (path === `${B}/customer-groups`) return [];
    const one = items.find((b) => path === `${B}/bookings/${b.id}`);
    if (one && method === "GET") return detailOf(one);
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    return undefined;
  });
}

describe("BookingsScreen", () => {
  beforeEach(() => wide(false));

  it("lists bookings in the business's words, and filters to those needing approval", async () => {
    const fetch = api();
    renderOpsScreen(<BookingsScreen />);
    expect(await screen.findByTestId("booking-row-BA-7K3F9Q")).toBeOnTheScreen();
    expect(screen.getByLabelText("Search appointments")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("filter-pending"));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).includes("status=pending_approval"))).toBe(true),
    );
    expect(screen.getByTestId("filter-reset")).toBeOnTheScreen();
  });

  it("says when nothing matches the filters, and clears them", async () => {
    api([]);
    renderOpsScreen(<BookingsScreen />);
    fireEvent.press(await screen.findByTestId("filter-pending"));
    expect(await screen.findByText("No appointments match")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("No upcoming appointments")).toBeOnTheScreen();
  });

  it("shows the API's error with a retry", async () => {
    mockApi((_m, path) => (path === `${B}/bookings` ? apiError(500, "INTERNAL", "Boom") : undefined));
    renderOpsScreen(<BookingsScreen />);
    expect(await screen.findByText("Boom")).toBeOnTheScreen();
  });

  it("on phones, opens a booking on its own screen", async () => {
    api();
    const app = renderOpsScreen(<BookingsScreen />, {
      routes: { "dashboard/[slug]/bookings/[id]": () => <BookingDetailScreen /> },
    });
    fireEvent.press(await screen.findByTestId("booking-row-BA-PEND01"));
    expect(await screen.findByTestId("needs-approval")).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/dashboard/lumen-physio/bookings/${pendingBooking.id}`);
  });

  it("on large screens, shows the booking beside the list", async () => {
    wide(true);
    api();
    renderOpsScreen(<BookingsScreen />);
    expect(await screen.findByText("Choose a appointment")).toBeOnTheScreen();
    fireEvent.press(await screen.findByTestId("booking-row-BA-PEND01"));
    const detail = await screen.findByTestId("booking-detail");
    expect(within(detail).getAllByText("Sam Pending").length).toBeGreaterThan(0);
    expect(screen.getByTestId("booking-row-BA-PEND01")).toBeSelected();
  });

  it("approves a pending request from its detail", async () => {
    wide(true);
    let current = pendingBooking;
    const fetch = api(undefined, (method, path) => {
      if (method === "POST" && path === `${B}/bookings/${pendingBooking.id}/approve`) {
        current = { ...pendingBooking, status: "confirmed" };
        return current;
      }
      if (method === "GET" && path === `${B}/bookings/${pendingBooking.id}`) return detailOf(current);
      return undefined;
    });
    renderOpsScreen(<BookingsScreen />);
    fireEvent.press(await screen.findByTestId("booking-row-BA-PEND01"));
    fireEvent.press(await screen.findByTestId("approve-booking"));
    expect(await screen.findByText("Appointment approved")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`POST ${B}/bookings/${pendingBooking.id}/approve`);
    await waitFor(() => expect(screen.queryByTestId("approve-booking")).toBeNull());
  });
});
