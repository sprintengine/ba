import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking, Share } from "react-native";
import { booking, bookingDetail, customer, customerSparse } from "@shared/api/__tests__/fixtures/bookings";
import { customerGroup } from "@shared/api/__tests__/fixtures/catalog";
import type { CustomerDetail as Detail } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BookingDetailScreen } from "~/features/bookings/BookingDetailScreen";
import { CustomerDetailScreen, CustomerPanel } from "./CustomerDetail";
import { CustomersScreen } from "./CustomersScreen";

const detail: Detail = { ...customer, bookings: [booking] };

function api(current: Detail = detail, extra?: (m: string, p: string, body: unknown) => unknown) {
  return mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === `${B}/customers` && method === "GET") return { items: [current], nextCursor: null };
    if (path === `${B}/customers/${current.id}` && method === "GET") return current;
    if (path === `${B}/customer-groups`) return [customerGroup];
    if (path === `${B}/bookings/${booking.id}` && method === "GET") return bookingDetail;
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    return undefined;
  });
}

const panel = (onErased = jest.fn()) => <CustomerPanel customerId={customer.id} onErased={onErased} />;

describe("CustomerDetail", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });

  it("shows who they are, how to reach them, their numbers and their history", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    api();
    renderOpsScreen(panel(), { section: "customers" });
    const view = await screen.findByTestId("customer-detail");
    expect(within(view).getAllByText("Rowan Example").length).toBeGreaterThan(0);
    // The badge under their name, and the group picker in Details.
    expect(await within(view).findAllByText("Members")).toHaveLength(2);
    expect(within(view).getByText("Has an account")).toBeOnTheScreen();
    expect(screen.getByLabelText("Appointments: 4")).toBeOnTheScreen();
    expect(screen.getByLabelText("Patient since: March 2026")).toBeOnTheScreen();
    expect(screen.getByTestId(`booking-row-${booking.reference}`)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: /Call/ }));
    fireEvent.press(screen.getByRole("button", { name: /Message/ }));
    fireEvent.press(screen.getByRole("button", { name: /rowan@example.test/ }));
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      "tel:+353855550199",
      "sms:+353855550199",
      "mailto:rowan@example.test",
    ]);
  });

  it("says when there's no way to reach them and nothing booked", async () => {
    api({ ...customerSparse, bookings: [] });
    renderOpsScreen(<CustomerPanel customerId={customerSparse.id} onErased={jest.fn()} />, {
      section: "customers",
    });
    expect(
      await screen.findByText("No contact details. Add an email or phone under Details."),
    ).toBeOnTheScreen();
    expect(screen.getByText("No appointments yet. Book something for Rowan.")).toBeOnTheScreen();
  });

  it("saves edited details", async () => {
    let body: unknown;
    const fetch = api(detail, (method, path, b) => {
      if (method === "PATCH" && path === `${B}/customers/${customer.id}`) {
        body = b;
        return { ...customer, notes: "Prefers mornings" };
      }
      return undefined;
    });
    renderOpsScreen(panel(), { section: "customers" });
    const form = await screen.findByTestId("customer-details-form");
    expect(within(form).getByTestId("customer-submit")).toBeDisabled();
    fireEvent.changeText(within(form).getByTestId("customer-notes"), "Prefers mornings");
    fireEvent.press(within(form).getByTestId("customer-submit"));
    expect(await screen.findByText("Saved")).toBeOnTheScreen();
    expect(body).toEqual({
      name: "Rowan Example",
      email: "rowan@example.test",
      phone: "+353 85 555 0199",
      groupId: customerGroup.id,
      notes: "Prefers mornings",
    });
    expect(calls(fetch)).toContain(`PATCH ${B}/customers/${customer.id}`);
  });

  it("shows a save that failed above the button", async () => {
    api(detail, (method) => (method === "PATCH" ? apiError(500, "INTERNAL", "Couldn't save") : undefined));
    renderOpsScreen(panel(), { section: "customers" });
    const form = await screen.findByTestId("customer-details-form");
    fireEvent.changeText(within(form).getByTestId("customer-name"), "Rowan E.");
    fireEvent.press(within(form).getByTestId("customer-submit"));
    expect(await within(form).findByTestId("customer-form-error")).toHaveTextContent("Couldn't save");
  });

  it("changes their group", async () => {
    let body: { groupId?: string | null } | undefined;
    api(detail, (method, _path, b) => {
      if (method === "PATCH") {
        body = b as typeof body;
        return { ...customer, groupId: null };
      }
      return undefined;
    });
    renderOpsScreen(panel(), { section: "customers" });
    fireEvent.press(await screen.findByTestId("customer-group"));
    fireEvent.press(await screen.findByText("No group"));
    fireEvent.press(screen.getByTestId("customer-submit"));
    await waitFor(() => expect(body?.groupId).toBeNull());
  });

  it("starts a new booking for them", async () => {
    api();
    renderOpsScreen(panel(), { section: "customers" });
    fireEvent.press(await screen.findByTestId("customer-new-booking"));
    expect(await screen.findByTestId("new-booking-sheet")).toBeOnTheScreen();
  });

  it("opens a booking from their history in the Customers stack", async () => {
    api();
    const app = renderOpsScreen(panel(), {
      section: "customers",
      routes: { "dashboard/[slug]/customers/booking/[id]": () => <BookingDetailScreen /> },
    });
    fireEvent.press(await screen.findByTestId(`booking-row-${booking.reference}`));
    expect(await screen.findByTestId("booking-detail")).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/dashboard/lumen-physio/customers/booking/${booking.id}`);
  });

  it("shares everything held about them", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    const fetch = api(detail, (method, path) =>
      method === "GET" && path === `${B}/customers/${customer.id}/export`
        ? { customer: { name: "Rowan" } }
        : undefined,
    );
    renderOpsScreen(panel(), { section: "customers" });
    fireEvent.press(await screen.findByTestId("export-customer"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]![0]).toEqual({
      title: "Rowan Example: data export",
      message: JSON.stringify({ customer: { name: "Rowan" } }, null, 2),
    });
    expect(calls(fetch)).toContain(`GET ${B}/customers/${customer.id}/export`);
  });

  it("says when the export failed", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    api(detail, (_m, path) =>
      path.endsWith("/export") ? apiError(500, "INTERNAL", "Export failed") : undefined,
    );
    renderOpsScreen(panel(), { section: "customers" });
    fireEvent.press(await screen.findByTestId("export-customer"));
    expect(await screen.findByText("Export failed")).toBeOnTheScreen();
    expect(logged).toHaveBeenCalled();
  });

  it("erases them only once their name is typed", async () => {
    const onErased = jest.fn();
    const fetch = api(detail, (method) =>
      method === "DELETE" ? new Response(null, { status: 204 }) : undefined,
    );
    renderOpsScreen(panel(onErased), { section: "customers" });
    fireEvent.press(await screen.findByTestId("erase-customer"));
    const sheet = await screen.findByTestId("erase-sheet");
    expect(within(sheet).getByTestId("confirm-erase")).toBeDisabled();
    fireEvent.changeText(within(sheet).getByTestId("erase-confirm-name"), "Rowan");
    expect(within(sheet).getByTestId("confirm-erase")).toBeDisabled();
    fireEvent.changeText(within(sheet).getByTestId("erase-confirm-name"), " ROWAN EXAMPLE ");
    fireEvent.press(within(sheet).getByTestId("confirm-erase"));
    await waitFor(() => expect(onErased).toHaveBeenCalled());
    expect(calls(fetch)).toContain(`DELETE ${B}/customers/${customer.id}`);
  });

  it("keeps them when erasing failed", async () => {
    const onErased = jest.fn();
    api(detail, (method) => (method === "DELETE" ? apiError(403, "FORBIDDEN", "Not allowed") : undefined));
    renderOpsScreen(panel(onErased), { section: "customers" });
    fireEvent.press(await screen.findByTestId("erase-customer"));
    fireEvent.changeText(await screen.findByTestId("erase-confirm-name"), "Rowan Example");
    fireEvent.press(screen.getByTestId("confirm-erase"));
    expect(await screen.findByText("Not allowed")).toBeOnTheScreen();
    expect(onErased).not.toHaveBeenCalled();
  });

  it("hides their data's export and erasure from staff", async () => {
    api();
    renderOpsScreen(panel(), { section: "customers", role: "staff" });
    expect(await screen.findByTestId("customer-detail")).toBeOnTheScreen();
    expect(screen.queryByTestId("export-customer")).toBeNull();
    expect(screen.queryByTestId("erase-customer")).toBeNull();
  });

  it("says when the customer isn't available", async () => {
    mockApi((_m, path) =>
      path === `${B}/customers/${customer.id}` ? apiError(404, "NOT_FOUND", "Not found") : undefined,
    );
    renderOpsScreen(panel(), { section: "customers" });
    expect(await screen.findByTestId("customer-unavailable")).toBeOnTheScreen();
  });

  it("shows other errors with a retry", async () => {
    mockApi((_m, path) =>
      path === `${B}/customers/${customer.id}` ? apiError(500, "INTERNAL", "Boom") : undefined,
    );
    renderOpsScreen(panel(), { section: "customers" });
    expect(await screen.findByText("Boom")).toBeOnTheScreen();
  });

  it("on its own screen, goes back to the list once erased", async () => {
    api(detail, (method) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined));
    const app = renderOpsScreen(<CustomersScreen />, {
      section: "customers",
      routes: { "dashboard/[slug]/customers/[id]": () => <CustomerDetailScreen /> },
    });
    fireEvent.press(await screen.findByTestId(`customer-row-${customer.id}`));
    fireEvent.press(await screen.findByTestId("erase-customer"));
    fireEvent.changeText(await screen.findByTestId("erase-confirm-name"), "Rowan Example");
    fireEvent.press(screen.getByTestId("confirm-erase"));
    await waitFor(() => expect(app.getPathname()).toBe("/"));
  });
});
