import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { service } from "@shared/api/__tests__/fixtures/catalog";
import { offer, offerPreview, offerSparse } from "@shared/api/__tests__/fixtures/offers";
import type { Offer, OfferInput, Service } from "@shared/api/types";
import { calls, json, mockApi, pending } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { OfferEditorScreen } from "./OfferEditorScreen";
import { OffersScreen } from "./OffersScreen";

const BASE = `/v1/businesses/${business.id}`;

const quiet: Offer = offer;
const lastMinute: Offer = {
  ...offerSparse,
  id: "o_last",
  name: "Last-minute fill",
  kind: "last_minute",
  label: "€5 off",
  summary: "Starting within 3 hours",
  status: "paused",
};
const services: Service[] = [service, { ...service, id: "s_follow", name: "Follow-up", isPublic: false }];

type Sent = { method: string; path: string; body: unknown };

/** The offers API: the list, services, preview, and every write recorded in `sent`. */
function api(
  list: Offer[] = [lastMinute, quiet],
  handle?: (method: string, path: string, body: unknown) => unknown,
) {
  const sent: Sent[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method !== "GET" && !path.endsWith("/offers/preview")) sent.push({ method, path, body });
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === `${BASE}/offers`) return list;
    if (method === "GET" && path === `${BASE}/services`) return services;
    if (method === "POST" && path === `${BASE}/offers/preview`) return offerPreview;
    if (method === "POST" && path === `${BASE}/offers`) return saved(body as OfferInput, "o_new");
    const id = path.split("/")[5]!;
    const current = list.find((o) => o.id === id)!;
    if (method === "PUT") return saved(body as OfferInput, id);
    if (path.endsWith("/pause")) return { ...current, status: "paused" };
    if (path.endsWith("/resume")) return { ...current, status: "active" };
    if (method === "DELETE") return new Response(null, { status: 204 });
    return undefined;
  });
  return { fetch, sent };
}

function saved(input: OfferInput, id: string): Offer {
  const { active, ...rest } = input;
  return { ...quiet, ...rest, id, status: active ? "active" : "paused", updatedAt: new Date().toISOString() };
}

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });
}

/** Confirms native alerts (delete, discard) with their destructive button. */
function confirmAlerts() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
}

function EditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OfferEditorScreen id={id ?? "new"} previewDelay={0} />;
}

function render(options: { role?: "owner" | "admin" | "staff" } = {}) {
  return renderBusinessScreen(<OffersScreen previewDelay={0} />, {
    role: options.role ?? "admin",
    path: "offers",
    routes: { "dashboard/[slug]/offers/[id]": () => <EditorRoute /> },
  });
}

describe("Offers", () => {
  // The test window is 750pt wide (an iPad layout); phones unless a test says otherwise.
  beforeEach(() => wide(false));

  it("lists deals with their status, schedule, services and use (running ones first)", async () => {
    api();
    render();
    const card = await screen.findByTestId(`offer-open-${quiet.id}`);
    expect(card).toHaveProp(
      "accessibilityLabel",
      expect.stringMatching(
        /^Quiet Tuesdays, 20% off, (Active|Ended|Scheduled|Limit reached)\. Off-peak: Tue, 13:00–17:00\. Initial assessment\. 3 of 50 used\. 1 Oct 2026 – 31 Dec 2026$/,
      ),
    );
    expect(screen.getByTestId(`offer-${lastMinute.id}`)).toHaveTextContent(
      /Last-minute fill.*€5 off.*Paused/,
    );
    expect(screen.getByText("Last-minute · Starting within 3 hours")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Resume Last-minute fill" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pause Quiet Tuesdays" })).toBeOnTheScreen();
    const ids = screen.getAllByTestId(/^offer-open-/).map((el) => el.props.testID);
    expect(ids).toEqual([`offer-open-${quiet.id}`, `offer-open-${lastMinute.id}`]);
  });

  it("pauses and resumes a deal", async () => {
    const { sent } = api();
    render();
    fireEvent.press(await screen.findByRole("button", { name: "Pause Quiet Tuesdays" }));
    expect(await screen.findByText("Quiet Tuesdays paused")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Resume Last-minute fill" }));
    expect(await screen.findByText("Last-minute fill resumed")).toBeOnTheScreen();
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      `POST ${BASE}/offers/${quiet.id}/pause`,
      `POST ${BASE}/offers/o_last/resume`,
    ]);
  });

  it("says when pausing fails", async () => {
    api(undefined, (method, path) =>
      path.endsWith("/pause")
        ? json({ error: { code: "FORBIDDEN", message: "Not allowed", fields: {} } }, 403)
        : undefined,
    );
    render();
    fireEvent.press(await screen.findByRole("button", { name: "Pause Quiet Tuesdays" }));
    expect(await screen.findByText("Not allowed")).toBeOnTheScreen();
  });

  it("deletes a deal after confirming, and not without", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "cancel")?.onPress?.();
    });
    const { fetch } = api();
    render();
    fireEvent.press(await screen.findByRole("button", { name: "Delete Quiet Tuesdays" }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Delete Quiet Tuesdays?",
        "It stops applying straight away. Bookings that already have the deal keep their price.",
        expect.any(Array),
        expect.any(Object),
      ),
    );
    expect(calls(fetch).filter((c) => c.startsWith("DELETE"))).toEqual([]);

    alert.mockRestore();
    confirmAlerts();
    fireEvent.press(screen.getByRole("button", { name: "Delete Quiet Tuesdays" }));
    expect(await screen.findByText("Quiet Tuesdays deleted")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`DELETE ${BASE}/offers/${quiet.id}`);
  });

  it("explains deals when there are none yet, and starts one", async () => {
    api([]);
    render();
    const empty = await screen.findByTestId("offers-empty");
    expect(within(empty).getByText("No offers yet")).toBeOnTheScreen();
    expect(within(empty).getByText(/Turn empty slots into appointments/)).toBeOnTheScreen();
    expect(
      within(empty).getByLabelText("Off-peak: e.g. 20% off Tuesday and Wednesday afternoons."),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("offers-new")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("offers-create")).toBeEnabled());
    fireEvent.press(screen.getByTestId("offers-create"));
    expect(await screen.findByTestId("offer-editor")).toBeOnTheScreen();
  });

  it("shows skeletons while loading", async () => {
    mockApi(() => pending());
    render();
    expect(await screen.findByLabelText("Loading offers")).toBeOnTheScreen();
  });

  it("shows an error with a retry", async () => {
    let failing = true;
    api(undefined, (method, path) =>
      failing && path === `${BASE}/offers`
        ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
        : undefined,
    );
    render();
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    failing = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByTestId(`offer-${quiet.id}`)).toBeOnTheScreen();
  });

  it("tells staff offers are for admins", async () => {
    const { fetch } = api();
    render({ role: "staff" });
    expect(await screen.findByText("Offers are for admins")).toBeOnTheScreen();
    expect(calls(fetch)).not.toContain(`GET ${BASE}/offers`);
  });

  it("on phones, edits a deal on its own screen and comes back after saving", async () => {
    const { sent } = api();
    render();
    fireEvent.press(await screen.findByTestId(`offer-open-${quiet.id}`));
    const name = await screen.findByTestId("offer-name");
    expect(name).toHaveDisplayValue("Quiet Tuesdays");
    fireEvent.changeText(name, "Quiet Tuesdays 2");
    await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
    expect(await screen.findByText("Quiet Tuesdays 2 saved")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("offer-editor")).toBeNull());
    expect(sent.at(-1)).toMatchObject({ method: "PUT", path: `${BASE}/offers/${quiet.id}` });
  });

  describe("on iPad", () => {
    beforeEach(() => wide(true));

    it("edits beside the list, the first deal open to start with", async () => {
      api();
      render();
      expect(await screen.findByText("Edit Quiet Tuesdays")).toBeOnTheScreen();
      expect(screen.getByTestId(`offer-open-${quiet.id}`)).toHaveProp("accessibilityState", {
        selected: true,
      });
      fireEvent.press(screen.getByTestId(`offer-open-${lastMinute.id}`));
      expect(await screen.findByText("Edit Last-minute fill")).toBeOnTheScreen();
      expect(screen.getByTestId(`offer-open-${lastMinute.id}`)).toHaveProp("accessibilityState", {
        selected: true,
      });
    });

    it("asks before dropping unsaved changes when another deal is chosen", async () => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style === "cancel")?.onPress?.();
      });
      api();
      render();
      fireEvent.changeText(await screen.findByTestId("offer-name"), "Changed");
      fireEvent.press(screen.getByTestId(`offer-open-${lastMinute.id}`));
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          "Discard changes?",
          expect.any(String),
          expect.any(Array),
          expect.any(Object),
        ),
      );
      expect(screen.getByText("Edit Quiet Tuesdays")).toBeOnTheScreen();

      alert.mockRestore();
      confirmAlerts();
      fireEvent.press(screen.getByTestId(`offer-open-${lastMinute.id}`));
      expect(await screen.findByText("Edit Last-minute fill")).toBeOnTheScreen();
    });

    it("creates a deal in the pane and keeps it open", async () => {
      const { sent } = api();
      render();
      await screen.findByText("Edit Quiet Tuesdays");
      await waitFor(() => expect(screen.getByTestId("offers-new")).toBeEnabled());
      fireEvent.press(screen.getByTestId("offers-new"));
      expect(await screen.findByText("New offer")).toBeOnTheScreen();
      fireEvent.changeText(screen.getByTestId("offer-name"), "Launch week");
      await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
      expect(await screen.findByText("Launch week created")).toBeOnTheScreen();
      expect(await screen.findByText("Edit Launch week")).toBeOnTheScreen();
      expect(sent.at(-1)).toMatchObject({ method: "POST", path: `${BASE}/offers` });
    });

    it("lets go of a deleted deal, and invites a new one when none are left", async () => {
      confirmAlerts();
      let list = [quiet];
      api(undefined, (method, path) => {
        if (method === "GET" && path === `${BASE}/offers`) return list;
        if (method === "DELETE") {
          list = [];
          return new Response(null, { status: 204 });
        }
        return undefined;
      });
      render();
      fireEvent.press(await screen.findByTestId(`offer-open-${quiet.id}`));
      fireEvent.press(screen.getByRole("button", { name: "Delete Quiet Tuesdays" }));
      expect(await screen.findByText("No offer open")).toBeOnTheScreen();
      fireEvent.press(screen.getAllByRole("button", { name: "New offer" }).at(-1)!);
      expect(await screen.findByTestId("offer-name")).toHaveDisplayValue("");
    });
  });
});
