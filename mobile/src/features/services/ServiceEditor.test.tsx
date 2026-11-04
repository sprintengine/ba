import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { router } from "expo-router";
import { customerGroup, resource } from "@shared/api/__tests__/fixtures/catalog";
import { json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { ServiceEditorScreen } from "./ServiceEditorScreen";
import { ServicesScreen } from "./ServicesScreen";
import {
  assessment,
  BASE,
  bodies,
  EditorRoute,
  jordan,
  massage,
  servicesApi,
  type Handler,
} from "./test-api";

const routes = { "dashboard/[slug]/services/[id]": () => <EditorRoute /> };

// Phones: the editor is its own pushed screen (ServicesScreen.test covers the iPad split view).
beforeEach(() => {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
});

/** The list, then a service's editor pushed on top (the phone's flow). */
async function openEditor(id: string, options: Parameters<typeof renderBusinessScreen>[1] = {}) {
  renderBusinessScreen(<ServicesScreen />, { path: "services", routes, ...options });
  fireEvent.press(await screen.findByTestId(id === "new" ? "services-new" : `service-open-${id}`));
  return screen.findByTestId("service-editor");
}

async function save() {
  const button = screen.getByTestId("service-save");
  await act(async () => fireEvent.press(button));
}

/** Picks `label` in the select sheet that `testID` opens. */
async function choose(testID: string, label: string) {
  fireEvent.press(screen.getByTestId(testID));
  fireEvent.press((await screen.findAllByRole("button", { name: label })).at(-1)!);
}

function confirm(choice: "destructive" | "cancel") {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === choice)?.onPress?.();
  });
}

const failing =
  (status: number, error: object): Handler =>
  (method) =>
    method === "PUT" ? json({ error }, status) : undefined;

describe("Service editor", () => {
  it("fills in the service and saves every part of it, then goes back to the list", async () => {
    const fetch = servicesApi();
    await openEditor(massage.id);
    expect(screen.getByTestId("service-name")).toHaveDisplayValue("Sports massage");
    expect(screen.queryByTestId("save-bar")).toBeNull();

    fireEvent.changeText(screen.getByTestId("service-name"), "Deep tissue massage");
    fireEvent.changeText(screen.getByTestId("service-duration"), "45");
    await choose("service-interval", "15 min");
    await choose("service-notice", "1 day");
    fireEvent.changeText(screen.getByTestId("service-max-advance"), "60");
    fireEvent(screen.getByTestId("service-group"), "valueChange", true);
    expect(screen.getByTestId("service-capacity")).toHaveDisplayValue("8");
    fireEvent.changeText(screen.getByTestId("service-capacity"), "");
    fireEvent.changeText(screen.getByTestId("service-capacity"), "12");
    fireEvent(screen.getByTestId("service-approval"), "valueChange", true);
    await choose("service-location", "Online");
    fireEvent.press(await screen.findByTestId(`service-groups-${customerGroup.id}`));
    fireEvent.press(screen.getByTestId("service-color-#6d5bd0"));
    expect(screen.getByTestId("save-bar")).toBeOnTheScreen();

    await save();
    expect(await screen.findByText("Deep tissue massage saved")).toBeOnTheScreen();
    const [body] = bodies(fetch, "PUT");
    expect(body).toMatchObject({
      name: "Deep tissue massage",
      durationMinutes: 45,
      slotIntervalMinutes: 15,
      minNoticeMinutes: 1440,
      maxAdvanceDays: 60,
      capacity: 12,
      requiresApproval: true,
      locationType: "online",
      allowedGroupIds: [customerGroup.id],
      color: "#6d5bd0",
      requirements: [expect.objectContaining({ id: "req-2", label: "Therapist" })],
    });
    // Back on the list.
    await waitFor(() => expect(screen.queryByTestId("service-editor")).toBeNull());
    expect(screen.getByTestId(`service-row-${massage.id}`)).toBeOnTheScreen();
  });

  it("creates a service with a price, an option, an add-on and who does it", async () => {
    const fetch = servicesApi();
    await openEditor("new");
    expect(screen.getByTestId("service-save")).toBeEnabled();
    fireEvent.changeText(screen.getByTestId("service-name"), "Pilates");
    // Categories in use are a tap away.
    fireEvent.press(screen.getByRole("button", { name: "Massage" }));
    expect(screen.getByTestId("service-category")).toHaveDisplayValue("Massage");
    fireEvent.press(screen.getByTestId("service-payment-full"));
    fireEvent.changeText(screen.getByTestId("service-price"), "45");
    fireEvent(screen.getByTestId("service-pay-at-venue"), "valueChange", true);

    fireEvent.press(screen.getByTestId("service-add-option"));
    fireEvent.changeText(screen.getByTestId("service-option-0-name"), "Long");
    fireEvent.changeText(screen.getByTestId("service-option-0-duration"), "60");
    fireEvent.changeText(screen.getByTestId("service-option-0-price"), "60");
    fireEvent.press(screen.getByTestId("service-add-option"));
    fireEvent.press(screen.getByTestId("service-option-1-remove"));

    fireEvent.press(screen.getByTestId("service-add-addon"));
    fireEvent.changeText(screen.getByTestId("service-addon-0-name"), "Mat hire");
    fireEvent.changeText(screen.getByTestId("service-addon-0-minutes"), "5");
    fireEvent.changeText(screen.getByTestId("service-addon-0-price"), "3");

    expect(screen.getByTestId("service-no-requirements")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("service-add-requirement"));
    fireEvent.changeText(screen.getByTestId("service-requirement-0-label"), "Instructor");
    fireEvent.press(await screen.findByTestId(`service-requirement-0-resources-${jordan.id}`));
    fireEvent(screen.getByTestId("service-requirement-0-selectable"), "valueChange", true);
    expect(screen.getByTestId("service-requirement-0-selectable")).toHaveProp(
      "accessibilityHint",
      "They pick their instructor when booking.",
    );

    await save();
    expect(await screen.findByText("Pilates created")).toBeOnTheScreen();
    const [body] = bodies(fetch, "POST");
    expect(body).toMatchObject({
      name: "Pilates",
      category: "Massage",
      paymentMode: "full",
      priceCents: 4500,
      allowPayAtVenue: true,
      sortOrder: 3,
      options: [{ name: "Long", durationMinutes: 60, priceCents: 6000, sortOrder: 0, description: null }],
      addons: [{ name: "Mat hire", extraMinutes: 5, priceCents: 300, sortOrder: 0, description: null }],
      requirements: [
        {
          label: "Instructor",
          quantity: 1,
          customerSelectable: true,
          resourceIds: [jordan.id],
          sortOrder: 0,
        },
      ],
    });
    await waitFor(() => expect(screen.queryByTestId("service-editor")).toBeNull());
  });

  it("checks the form before saving", async () => {
    const fetch = servicesApi();
    await openEditor(assessment.id);
    fireEvent.changeText(screen.getByTestId("service-name"), " ");
    fireEvent.changeText(screen.getByTestId("service-deposit"), "500");
    fireEvent.changeText(screen.getByTestId("service-duration"), "");
    await save();
    expect(await screen.findByText("Give the service a name")).toBeOnTheScreen();
    expect(screen.getByText("Enter a duration")).toBeOnTheScreen();
    expect(screen.getByText("Check the highlighted fields")).toBeOnTheScreen();

    // The rules across fields run once each field is valid.
    fireEvent.changeText(screen.getByTestId("service-name"), "Assessment");
    fireEvent.changeText(screen.getByTestId("service-duration"), "60");
    await save();
    expect(await screen.findByText("The deposit can't be more than the price")).toBeOnTheScreen();
    expect(bodies(fetch, "PUT")).toEqual([]);
  });

  it("lets only one requirement be chosen by the customer", async () => {
    servicesApi();
    await openEditor(assessment.id);
    fireEvent.press(screen.getByTestId("service-add-requirement"));
    fireEvent.changeText(screen.getByTestId("service-requirement-1-label"), "Room");
    fireEvent.press(await screen.findByTestId(`service-requirement-1-resources-${resource.id}`));
    fireEvent(screen.getByTestId("service-requirement-1-selectable"), "valueChange", true);
    await save();
    expect(await screen.findAllByText("Only one requirement can be chosen by the customer")).toHaveLength(2);
  });

  it("puts the server's field errors on the fields, and other messages above the save bar", async () => {
    let error: object = {
      code: "INVALID_REQUEST",
      message: "Check the options",
      fields: { "options[0].name": "Already used", name: "Too similar" },
    };
    servicesApi(undefined, (method) => (method === "PUT" ? json({ error }, 400) : undefined));
    await openEditor(assessment.id);
    fireEvent.changeText(screen.getByTestId("service-name"), "Assessment");
    await save();
    expect(await screen.findByText("Already used")).toBeOnTheScreen();
    expect(screen.getByText("Too similar")).toBeOnTheScreen();

    error = { code: "CONFLICT", message: "Try again later", fields: {} };
    await save();
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Try again later");
    expect(screen.getByTestId("service-editor")).toBeOnTheScreen();
  });

  it("discards changes from the save bar", async () => {
    servicesApi(undefined, failing(500, {}));
    await openEditor(massage.id);
    fireEvent.changeText(screen.getByTestId("service-name"), "Something else");
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByTestId("service-name")).toHaveDisplayValue("Sports massage");
    expect(screen.getByTestId("service-save")).toBeDisabled();
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("deletes after confirming, and not when cancelled", async () => {
    const cancel = confirm("cancel");
    const fetch = servicesApi();
    await openEditor(massage.id);
    await act(async () => fireEvent.press(screen.getByTestId("service-delete")));
    expect(cancel).toHaveBeenCalled();
    expect(bodies(fetch, "DELETE")).toEqual([]);
    cancel.mockRestore();

    confirm("destructive");
    await act(async () => fireEvent.press(screen.getByTestId("service-delete")));
    expect(await screen.findByText("Sports massage removed")).toBeOnTheScreen();
    expect(
      fetch.mock.calls.some(
        ([url, init]) => init?.method === "DELETE" && String(url).endsWith(`/services/${massage.id}`),
      ),
    ).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("service-editor")).toBeNull());
  });

  it("says when a delete fails", async () => {
    confirm("destructive");
    servicesApi(undefined, (method) =>
      method === "DELETE"
        ? json({ error: { code: "FORBIDDEN", message: "Not yours to delete", fields: {} } }, 403)
        : undefined,
    );
    await openEditor(massage.id);
    await act(async () => fireEvent.press(screen.getByTestId("service-delete")));
    expect(await screen.findByText("Not yours to delete")).toBeOnTheScreen();
    expect(screen.getByTestId("service-editor")).toBeOnTheScreen();
  });

  it("shows the questions asked and the release schedules that open its days", async () => {
    servicesApi();
    await openEditor(assessment.id);
    const questions = screen.getByTestId("service-questions");
    expect(await within(questions).findByText("Which knee?")).toBeOnTheScreen();
    expect(within(questions).getByText("Anything else?")).toBeOnTheScreen();
    expect(within(questions).getByText("All services")).toBeOnTheScreen();
    expect(await screen.findByTestId("service-release-note")).toHaveTextContent(/GMS next-day \(Members\)/);
    // A new service has no questions of its own yet.
  });

  it("warns that online payment needs payments connected", async () => {
    servicesApi();
    await openEditor(massage.id, { business: { paymentsEnabled: false } });
    expect(screen.queryByTestId("service-payments-warning")).toBeNull();
    fireEvent.press(screen.getByTestId("service-payment-deposit"));
    expect(screen.getByTestId("service-payments-warning")).toBeOnTheScreen();
    expect(screen.getByTestId("service-deposit")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("service-payment-free"));
    expect(screen.queryByTestId("service-price")).toBeNull();
    expect(screen.queryByTestId("service-payments-warning")).toBeNull();
  });
});

describe("Service editor screen", () => {
  it("says when the service doesn't exist", async () => {
    const back = jest.spyOn(router, "back").mockImplementation(() => undefined);
    servicesApi();
    renderBusinessScreen(<ServiceEditorScreen id="gone" />, { path: "services/gone" });
    expect(await screen.findByTestId("service-missing")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "All services" }));
    expect(back).toHaveBeenCalled();
  });

  it("loads, and offers a retry when loading fails", async () => {
    let fail = true;
    mockApi((method, path) =>
      path === `${BASE}/services`
        ? fail
          ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
          : [massage]
        : undefined,
    );
    renderBusinessScreen(<ServiceEditorScreen id={massage.id} />, { path: `services/${massage.id}` });
    expect(screen.getByTestId("service-loading")).toBeOnTheScreen();
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("service-editor")).toBeOnTheScreen();
  });
});
