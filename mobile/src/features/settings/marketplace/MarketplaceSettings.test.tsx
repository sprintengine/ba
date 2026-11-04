import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { marketplaceSettings, marketplaceSettingsSparse } from "@shared/api/__tests__/fixtures/marketplace";
import type { MarketplaceSettings as Settings } from "@shared/api/types";
import { apiError, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { MarketplaceSettings } from "./MarketplaceSettings";

const PATH = `/v1/businesses/${business.id}/marketplace`;
const categories = [
  ...marketplaceSettings.categories,
  { key: "dental", label: "Dentistry", plural: "Dentists" },
];

function api(settings: Settings | (() => unknown), put?: (body: unknown) => unknown) {
  const puts: unknown[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method === "GET" && path === PATH) return typeof settings === "function" ? settings() : settings;
    if (method === "PUT" && path === PATH) {
      puts.push(body);
      if (put) return put(body);
      return { ...(settings as Settings), ...(body as object) };
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, puts };
}

const render = () =>
  renderBusinessScreen(<MarketplaceSettings />, {
    path: "settings/marketplace",
    routes: { "dashboard/[slug]/settings/general": () => <View testID="general-screen" /> },
  });

describe("Settings › Marketplace", () => {
  it("shows a listed business on the map, and unlists it", async () => {
    const { puts } = api({ ...marketplaceSettings, categories });
    render();
    const listed = await screen.findByTestId("marketplace-listed");
    expect(listed).toHaveProp("value", true);
    expect(listed.props.accessibilityHint).toBe(
      "Commission-free: bookings from the marketplace cost you nothing extra.",
    );
    expect(screen.getByTestId("marketplace-category")).toHaveAccessibleName("Category: Physiotherapy");
    expect(screen.getByTestId("marketplace-location")).toHaveAccessibleName(
      "You're on the map. We found your address and placed you to your street address.",
    );
    expect(screen.queryByTestId("marketplace-plan")).toBeNull();

    await act(async () => fireEvent(listed, "valueChange", false));
    await waitFor(() => expect(puts).toEqual([{ listed: false, category: "physio" }]));
    expect(await screen.findByText("Removed from the marketplace")).toBeOnTheScreen();
  });

  it("saves a new category straight away while listed", async () => {
    const { puts } = api({ ...marketplaceSettings, categories });
    render();
    fireEvent.press(await screen.findByTestId("marketplace-category"));
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Dentistry" })));
    await waitFor(() => expect(puts).toEqual([{ listed: true, category: "dental" }]));
    expect(await screen.findByText("Category saved")).toBeOnTheScreen();
  });

  it("keeps an unlisted business's category until it lists, and finds it on the marketplace", async () => {
    const { puts } = api({ ...marketplaceSettingsSparse, categories });
    render();
    fireEvent.press(await screen.findByTestId("marketplace-category"));
    fireEvent.press(await screen.findByRole("button", { name: "Dentistry" }));
    expect(puts).toEqual([]);
    await act(async () => fireEvent(screen.getByTestId("marketplace-listed"), "valueChange", true));
    await waitFor(() => expect(puts).toEqual([{ listed: true, category: "dental" }]));
    expect(await screen.findByText(`${business.name} is on the marketplace`)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "Browse the marketplace" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(expect.stringMatching(/\/explore$/));
  });

  it("without an address, says so and opens General settings", async () => {
    api(marketplaceSettingsSparse);
    render();
    expect(await screen.findByTestId("marketplace-location")).toHaveAccessibleName(
      "Add your address. Without one you won't show up in location searches. Add it in General settings.",
    );
    fireEvent.press(screen.getByTestId("marketplace-open-general"));
    expect(await screen.findByTestId("general-screen")).toBeOnTheScreen();
  });

  it.each([
    ["pending", "We're locating your address"],
    ["not_found", "We couldn't find your address"],
  ] as const)("explains the %s location", async (locationStatus, title) => {
    api({ ...marketplaceSettings, location: null, locationStatus });
    render();
    expect(await screen.findByText(title)).toBeOnTheScreen();
  });

  it("when the plan doesn't include it: a neutral note, no way to buy, and listing is off", async () => {
    api({ ...marketplaceSettingsSparse, eligible: false });
    render();
    expect(await screen.findByTestId("marketplace-plan")).toHaveTextContent(
      /isn't part of this business's current plan/,
    );
    expect(screen.getByTestId("marketplace-listed").props.accessibilityHint).toBe(
      "Not included in your current plan.",
    );
    expect(screen.queryByText(/See plans|Upgrade|Pro/)).toBeNull();
  });

  it("shows the plan note when the server says the plan's limit is reached, without its upgrade message", async () => {
    api(marketplaceSettingsSparse, () => apiError(402, "PLAN_LIMIT_REACHED", "Upgrade to list"));
    render();
    fireEvent(await screen.findByTestId("marketplace-listed"), "valueChange", true);
    expect(await screen.findByTestId("marketplace-plan")).toBeOnTheScreen();
    expect(screen.getByTestId("marketplace-listed").props.accessibilityHint).toBe(
      "Not included in your current plan.",
    );
    expect(screen.queryByText("Upgrade to list")).toBeNull();
  });

  it("says when a save fails", async () => {
    api(marketplaceSettings, () => apiError(409, "CONFLICT", "Try again"));
    render();
    fireEvent(await screen.findByTestId("marketplace-listed"), "valueChange", false);
    expect(await screen.findByText("Try again")).toBeOnTheScreen();
  });

  it("shows an error with a retry", async () => {
    let fail = true;
    api(() => (fail ? apiError(500, "INTERNAL", "Server down") : marketplaceSettings));
    render();
    expect(await screen.findByText("Server down")).toBeOnTheScreen();
    fail = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: /try again/i })));
    expect(await screen.findByTestId("marketplace-listed")).toBeOnTheScreen();
  });
});
