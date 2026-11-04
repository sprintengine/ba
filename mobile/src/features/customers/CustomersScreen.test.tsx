import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { booking, customer, customerSparse } from "@shared/api/__tests__/fixtures/bookings";
import { customerGroup } from "@shared/api/__tests__/fixtures/catalog";
import type { Customer, CustomerDetail as Detail } from "@shared/api/types";
import { apiError, calls, json, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { CustomerDetailScreen } from "./CustomerDetail";
import { CustomersScreen } from "./CustomersScreen";

const sam: Customer = { ...customerSparse, id: "00000000-0000-4000-8000-000000000051", name: "Sam Sparse" };
const detailOf = (c: Customer): Detail => ({ ...c, bookings: c.id === customer.id ? [booking] : [] });

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1180 : 390, height: 820 });
}

function api(items: Customer[] = [customer, sam], extra?: (m: string, p: string, body: unknown) => unknown) {
  return mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === `${B}/customers` && method === "GET") return { items, nextCursor: null };
    if (path === `${B}/customer-groups`) return [customerGroup];
    const one = items.find((c) => path === `${B}/customers/${c.id}`);
    if (one && method === "GET") return detailOf(one);
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    return undefined;
  });
}

describe("CustomersScreen", () => {
  beforeEach(() => wide(false));

  it("lists customers in the business's words, with their group, account and count", async () => {
    api();
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    const row = await screen.findByTestId(`customer-row-${customer.id}`);
    expect(row).toHaveAccessibleName(
      "Rowan Example. Has an account. rowan@example.test. Members. 4 appointments. Last 6 Oct 2026",
    );
    expect(within(row).getByText("Members")).toBeOnTheScreen();
    expect(screen.getByTestId(`customer-row-${sam.id}`)).toHaveAccessibleName(
      "Sam Sparse. No contact details. 0 appointments",
    );
    expect(screen.getByLabelText("Search patients")).toBeOnTheScreen();
    expect(await screen.findByText("2 patients")).toBeOnTheScreen();
  });

  it("searches by name, email or phone, and says when nothing matches", async () => {
    const fetch = api([], undefined);
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    expect(await screen.findByText("No patients yet")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("customers-search"), "zed");
    expect(await screen.findByText("No patients match “zed”")).toBeOnTheScreen();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("q=zed"))).toBe(true);
    fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByText("No patients yet")).toBeOnTheScreen();
  });

  it("shows the API's error with a retry", async () => {
    mockApi((_m, path) => (path === `${B}/customers` ? apiError(500, "INTERNAL", "Boom") : undefined));
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    expect(await screen.findByText("Boom")).toBeOnTheScreen();
  });

  it("adds a customer, checking the form, then opens them", async () => {
    const added: Customer = {
      ...customerSparse,
      id: "00000000-0000-4000-8000-000000000052",
      name: "Ada New",
    };
    let body: unknown;
    const fetch = api([], (method, path, b) => {
      if (method === "POST" && path === `${B}/customers`) {
        body = b;
        return added;
      }
      if (method === "GET" && path === `${B}/customers/${added.id}`) return detailOf(added);
      return undefined;
    });
    const app = renderOpsScreen(<CustomersScreen />, {
      section: "customers",
      routes: { "dashboard/[slug]/customers/[id]": () => <CustomerDetailScreen /> },
    });
    fireEvent.press(await screen.findByRole("button", { name: "Add patient" }));
    const sheet = await screen.findByTestId("add-customer-sheet");
    fireEvent.press(within(sheet).getByTestId("customer-submit"));
    expect(await within(sheet).findByText("Enter a name")).toBeOnTheScreen();
    fireEvent.changeText(within(sheet).getByTestId("customer-name"), "  Ada New ");
    fireEvent.changeText(within(sheet).getByTestId("customer-email"), "not-an-email");
    fireEvent.press(within(sheet).getByTestId("customer-submit"));
    expect(await within(sheet).findByText("Enter a valid email")).toBeOnTheScreen();
    fireEvent.changeText(within(sheet).getByTestId("customer-email"), "ada@example.test");
    fireEvent.press(within(sheet).getByTestId("customer-submit"));
    expect(await screen.findByText("Ada New added")).toBeOnTheScreen();
    expect(body).toEqual({
      name: "Ada New",
      email: "ada@example.test",
      phone: null,
      groupId: null,
      notes: null,
    });
    expect(calls(fetch)).toContain(`POST ${B}/customers`);
    await waitFor(() => expect(app.getPathname()).toBe(`/dashboard/lumen-physio/customers/${added.id}`));
    expect(await screen.findByTestId("customer-detail")).toBeOnTheScreen();
  });

  it("shows the server's field errors on the add form", async () => {
    api([], (method, path) =>
      method === "POST" && path === `${B}/customers`
        ? json(
            { error: { code: "VALIDATION", message: "Invalid", fields: { phone: "Not a phone number" } } },
            422,
          )
        : undefined,
    );
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    fireEvent.press(await screen.findByRole("button", { name: "Add patient" }));
    const sheet = await screen.findByTestId("add-customer-sheet");
    fireEvent.changeText(within(sheet).getByTestId("customer-name"), "Ada");
    fireEvent.press(within(sheet).getByTestId("customer-submit"));
    expect(await within(sheet).findByText("Not a phone number")).toBeOnTheScreen();
  });

  it("on phones, opens a customer on their own screen", async () => {
    api();
    const app = renderOpsScreen(<CustomersScreen />, {
      section: "customers",
      routes: { "dashboard/[slug]/customers/[id]": () => <CustomerDetailScreen /> },
    });
    fireEvent.press(await screen.findByTestId(`customer-row-${customer.id}`));
    expect(await screen.findByTestId("customer-detail")).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/dashboard/lumen-physio/customers/${customer.id}`);
  });

  it("on large screens, shows the customer beside the list", async () => {
    wide(true);
    api();
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    expect(await screen.findByText("Choose a patient")).toBeOnTheScreen();
    fireEvent.press(await screen.findByTestId(`customer-row-${sam.id}`));
    const detail = await screen.findByTestId("customer-detail");
    expect(within(detail).getAllByText("Sam Sparse").length).toBeGreaterThan(0);
    expect(screen.getByTestId(`customer-row-${sam.id}`)).toBeSelected();
  });

  it("on large screens, clears the detail once the customer is erased", async () => {
    wide(true);
    api([customer], (method, path) =>
      method === "DELETE" && path === `${B}/customers/${customer.id}`
        ? new Response(null, { status: 204 })
        : undefined,
    );
    renderOpsScreen(<CustomersScreen />, { section: "customers" });
    fireEvent.press(await screen.findByTestId(`customer-row-${customer.id}`));
    fireEvent.press(await screen.findByTestId("erase-customer"));
    fireEvent.changeText(await screen.findByTestId("erase-confirm-name"), "rowan example");
    fireEvent.press(screen.getByTestId("confirm-erase"));
    expect(await screen.findByText("Personal data erased")).toBeOnTheScreen();
    expect(await screen.findByText("Choose a patient")).toBeOnTheScreen();
  });
});
