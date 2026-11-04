import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { ServicesScreen } from "./ServicesScreen";
import { assessment, BASE, bodies, EditorRoute, massage, oldClass, servicesApi } from "./test-api";

const routes = { "dashboard/[slug]/services/[id]": () => <EditorRoute /> };

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });
}

beforeEach(() => wide(false));

describe("Services list", () => {
  it("lists active services by category and inactive ones apart", async () => {
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    const row = await screen.findByTestId(`service-row-${assessment.id}`);
    expect(row).toHaveTextContent(/Initial assessment/);
    expect(row).toHaveTextContent(/Deposit or at venue · 1 option · 1 add-on/);
    expect(screen.getByRole("header", { name: "PHYSIOTHERAPY" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "MASSAGE" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "INACTIVE" })).toBeOnTheScreen();
    // Badges are words, and the row reads as one sentence.
    const old = screen.getByTestId(`service-open-${oldClass.id}`);
    expect(old).toHaveProp(
      "accessibilityLabel",
      expect.stringMatching(/^Old class, Private, 8 seats, Inactive/),
    );
  });

  it("lets staff see the list without editing anything", async () => {
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", role: "staff", routes });
    const open = await screen.findByTestId(`service-open-${assessment.id}`);
    expect(open).not.toHaveProp("accessibilityRole", "button");
    expect(screen.queryByTestId(`service-active-${assessment.id}`)).toBeNull();
    expect(screen.queryByTestId("services-new")).toBeNull();
    expect(screen.queryByTestId("services-reorder")).toBeNull();
  });

  it("says when there are no services, with the next step for admins only", async () => {
    servicesApi([]);
    const view = renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    const empty = await screen.findByTestId("services-empty");
    expect(within(empty).getByText("No services yet")).toBeOnTheScreen();
    fireEvent.press(within(empty).getByRole("button", { name: "New service" }));
    expect(await screen.findByTestId("service-editor")).toBeOnTheScreen();
    view.unmount();

    servicesApi([]);
    renderBusinessScreen(<ServicesScreen />, { path: "services", role: "staff", routes });
    expect(await screen.findByText("No services yet")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "New service" })).toBeNull();
  });

  it("shows skeletons while loading", async () => {
    mockApi(() => new Promise<Response>(() => undefined));
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    expect(await screen.findByTestId("services-loading")).toBeOnTheScreen();
  });

  it("shows an error with a retry", async () => {
    let failing = true;
    servicesApi(undefined, (method, path) =>
      failing && path === `${BASE}/services`
        ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
        : undefined,
    );
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    failing = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId(`service-row-${assessment.id}`)).toBeOnTheScreen();
  });

  it("switches Active and Public from the row, saving the whole service", async () => {
    const fetch = servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent(await screen.findByTestId(`service-active-${massage.id}`), "valueChange", false);
    expect(await screen.findByText("Sports massage deactivated")).toBeOnTheScreen();
    const [body] = bodies(fetch, "PUT");
    expect(body).toMatchObject({ name: "Sports massage", isActive: false, priceCents: 5000 });
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith(`/services/${massage.id}`))).toBe(true);

    fireEvent(screen.getByTestId(`service-public-${assessment.id}`), "valueChange", false);
    expect(await screen.findByText("Initial assessment is now private")).toBeOnTheScreen();
  });

  it("names each row's switch after its service, and lets a screen reader flip it", async () => {
    const fetch = servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    const toggle = await screen.findByRole("switch", { name: "Active: Sports massage" });
    expect(toggle).toHaveProp("accessibilityHint", "Bookable");
    fireEvent(toggle, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(await screen.findByText("Sports massage deactivated")).toBeOnTheScreen();
    expect(bodies(fetch, "PUT")[0]).toMatchObject({ isActive: false });
    // Public can't be switched on an inactive service.
    expect(screen.getByRole("switch", { name: "Public: Old class" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true }),
    );
  });

  it("puts a switch back when the server refuses", async () => {
    servicesApi(undefined, (method) =>
      method === "PUT"
        ? json({ error: { code: "FORBIDDEN", message: "Not allowed", fields: {} } }, 403)
        : undefined,
    );
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    const toggle = await screen.findByTestId(`service-active-${massage.id}`);
    fireEvent(toggle, "valueChange", false);
    expect(await screen.findByText("Not allowed")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId(`service-active-${massage.id}`)).toHaveProp("value", true));
  });

  it("changes the order and saves only the services that moved", async () => {
    const fetch = servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent.press(await screen.findByTestId("services-reorder"));
    expect(screen.getByTestId(`service-move-up-${assessment.id}`)).toBeDisabled();
    fireEvent.press(screen.getByTestId(`service-move-down-${assessment.id}`));
    expect(screen.getByLabelText(/^Initial assessment.*position 2 of 3$/)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId("services-reorder-done")));
    expect(await screen.findByText("Order saved")).toBeOnTheScreen();
    expect(bodies(fetch, "PUT").map((b) => [b.name, b.sortOrder])).toEqual([
      ["Sports massage", 0],
      ["Initial assessment", 1],
    ]);
    expect(screen.queryByTestId("services-reorder-done")).toBeNull();
  });

  it("leaves the order alone when cancelled or unchanged", async () => {
    const fetch = servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent.press(await screen.findByTestId("services-reorder"));
    fireEvent.press(screen.getByTestId(`service-move-down-${assessment.id}`));
    fireEvent.press(screen.getByTestId("services-reorder-cancel"));
    expect(screen.queryByTestId(`service-move-down-${assessment.id}`)).toBeNull();

    fireEvent.press(screen.getByTestId("services-reorder"));
    await act(async () => fireEvent.press(screen.getByTestId("services-reorder-done")));
    expect(screen.queryByTestId("services-reorder-done")).toBeNull();
    expect(bodies(fetch, "PUT")).toEqual([]);
  });

  it("opens a service's editor on its own screen on phones", async () => {
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent.press(await screen.findByTestId(`service-open-${massage.id}`));
    expect(await screen.findByTestId("service-name")).toHaveDisplayValue("Sports massage");
  });
});

describe("Services on iPad", () => {
  beforeEach(() => wide(true));

  it("edits beside the list, asking before dropping unsaved changes", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "cancel")?.onPress?.();
    });
    const fetch = servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    expect(await screen.findByText("Choose a service")).toBeOnTheScreen();
    fireEvent.press(await screen.findByTestId(`service-open-${massage.id}`));
    expect(await screen.findByText("Edit Sports massage")).toBeOnTheScreen();
    expect(screen.getByTestId(`service-open-${massage.id}`)).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );

    fireEvent.changeText(screen.getByTestId("service-name"), "Deep tissue massage");
    // Keep editing: the other service doesn't open.
    fireEvent.press(screen.getByTestId(`service-open-${assessment.id}`));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(screen.getByText("Edit Sports massage")).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByTestId("service-save")));
    expect(await screen.findByText("Deep tissue massage saved")).toBeOnTheScreen();
    expect(bodies(fetch, "PUT")[0]).toMatchObject({ name: "Deep tissue massage" });
    // Saved: it stays open.
    expect(screen.getByTestId("service-editor")).toBeOnTheScreen();
  });

  it("creates a service beside the list and keeps it open", async () => {
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent.press(await screen.findByTestId("services-new"));
    fireEvent.changeText(await screen.findByTestId("service-name"), "Pilates");
    expect(screen.getByRole("header", { name: "New service" })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId("service-save")));
    expect(await screen.findByText("Pilates created")).toBeOnTheScreen();
    expect(await screen.findByText("Edit Pilates")).toBeOnTheScreen();
  });

  it("goes back to choosing after a delete", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", routes });
    fireEvent.press(await screen.findByTestId(`service-open-${massage.id}`));
    const remove = await screen.findByTestId("service-delete");
    await act(async () => fireEvent.press(remove));
    expect(await screen.findByText("Sports massage removed")).toBeOnTheScreen();
    expect(await screen.findByText("Choose a service")).toBeOnTheScreen();
  });

  it("shows staff just the list", async () => {
    servicesApi();
    renderBusinessScreen(<ServicesScreen />, { path: "services", role: "staff", routes });
    expect(await screen.findByTestId(`service-row-${assessment.id}`)).toBeOnTheScreen();
    expect(screen.queryByText("Choose a service")).toBeNull();
    expect(within(screen.getByTestId("services")).queryByTestId("service-editor")).toBeNull();
  });
});
