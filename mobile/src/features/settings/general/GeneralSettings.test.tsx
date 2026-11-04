import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, View } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { GeneralSettings } from "./GeneralSettings";

const PATH = `/v1/businesses/${business.id}`;

function api(handle?: (method: string, path: string, body: unknown) => unknown) {
  return mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === "/v1/businesses/slug-available") return { available: true, suggestion: null };
    if (method === "PATCH" && path === PATH)
      return { ...business, slug: "lumen-physio", ...(body as object) };
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
}

const bodyOf = (fetch: jest.Mock, method: string) =>
  JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === method)![1]!.body)) as Record<
    string,
    unknown
  >;

describe("Settings › General", () => {
  it("saves the business's details, and only when something changed", async () => {
    const fetch = api();
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    const save = await screen.findByTestId("settings-save");
    expect(save).toBeDisabled();
    expect(screen.queryByTestId("save-bar")).toBeNull();

    fireEvent.changeText(screen.getByTestId("general-name"), "Lumen Physio Clinic");
    expect(screen.getByTestId("save-bar")).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Settings saved")).toBeOnTheScreen();
    const body = bodyOf(fetch, "PATCH");
    expect(body.name).toBe("Lumen Physio Clinic");
    expect(body.address).toEqual({
      line1: business.address.line1,
      line2: business.address.line2,
      city: business.address.city,
      postcode: business.address.postcode,
    });
    await waitFor(() => expect(screen.queryByTestId("save-bar")).toBeNull());
  });

  it("checks validation before saving", async () => {
    const fetch = api();
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    fireEvent.changeText(await screen.findByTestId("general-name"), " ");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Enter your business name")).toBeOnTheScreen();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("lowercases the address and says when it's taken, offering the suggestion", async () => {
    api((method, path) =>
      path === "/v1/businesses/slug-available"
        ? { available: false, suggestion: "lumen-clinic-2" }
        : undefined,
    );
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    fireEvent.changeText(await screen.findByTestId("general-slug"), "Lumen Clinic");
    expect(screen.getByTestId("general-slug")).toHaveDisplayValue("lumen-clinic");
    expect(await screen.findByTestId("slug-taken", {}, { timeout: 3000 })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Use lumen-clinic-2" }));
    expect(screen.getByTestId("general-slug")).toHaveDisplayValue("lumen-clinic-2");
    // The suggestion re-validates the form asynchronously; let it settle inside act.
    await act(async () => {});
  });

  it("puts the server's field errors on the fields (address.city → Town or city)", async () => {
    api((method) =>
      method === "PATCH"
        ? json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "Check the address",
                fields: { "address.city": "Too long", contactPhone: "Not a phone number" },
              },
            },
            400,
          )
        : undefined,
    );
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    fireEvent.changeText(await screen.findByTestId("general-name"), "Lumen 2");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Too long")).toBeOnTheScreen();
    expect(screen.getByText("Not a phone number")).toBeOnTheScreen();
  });

  it("shows a message that belongs to no field above the save bar", async () => {
    api((method) =>
      method === "PATCH"
        ? json({ error: { code: "CONFLICT", message: "Try again later", fields: {} } }, 409)
        : undefined,
    );
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    fireEvent.changeText(await screen.findByTestId("general-name"), "Lumen 2");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Try again later");
  });

  it("discards changes from the save bar", async () => {
    api();
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general" });
    fireEvent.changeText(await screen.findByTestId("general-name"), "Something else");
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByTestId("general-name")).toHaveDisplayValue(business.name);
    expect(screen.getByTestId("settings-save")).toBeDisabled();
  });

  it("lets only owners delete the business, after confirming", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const fetch = api((method) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined));
    const view = renderBusinessScreen(<GeneralSettings />, {
      path: "settings/general",
      role: "owner",
      routes: { "dashboard/index": () => <View testID="dashboard-screen" /> },
    });
    await act(async () => fireEvent.press(await screen.findByTestId("general-delete")));
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true));
    view.unmount();

    api();
    renderBusinessScreen(<GeneralSettings />, { path: "settings/general", role: "admin" });
    await screen.findByTestId("general-name");
    expect(screen.queryByTestId("general-delete")).toBeNull();
  });
});
