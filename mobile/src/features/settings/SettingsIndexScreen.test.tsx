import { act, fireEvent, screen } from "@testing-library/react-native";
import { Alert, View } from "react-native";
import { paymentsStatus } from "@shared/api/__tests__/fixtures/dashboard";
import type { MemberRole } from "@shared/api/types";
import { mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { SettingsSectionRoute } from "./sections";
import { SettingsIndexScreen } from "./SettingsIndexScreen";

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });
}

beforeEach(() => {
  mockApi((method, path) => {
    if (path.endsWith("/payments/status")) return paymentsStatus;
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
});

const index = (role: MemberRole = "owner") =>
  renderBusinessScreen(<SettingsIndexScreen />, {
    path: "settings",
    role,
    routes: { "dashboard/[slug]/settings/questions": () => <View testID="questions-route" /> },
  });

describe("Settings index", () => {
  it("on phones, lists the sections this member may open and pushes one", async () => {
    wide(false);
    index();
    expect(await screen.findByTestId("settings-billing")).toBeOnTheScreen();
    expect(screen.getByTestId("settings-payments")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("settings-questions"));
    expect(await screen.findByTestId("questions-route")).toBeOnTheScreen();
  });

  it("hides the owners' sections from admins, and everything from staff", async () => {
    wide(false);
    const view = index("admin");
    expect(await screen.findByTestId("settings-general")).toBeOnTheScreen();
    expect(screen.queryByTestId("settings-billing")).toBeNull();
    expect(screen.queryByTestId("settings-payments")).toBeNull();
    view.unmount();

    index("staff");
    expect(await screen.findByTestId("forbidden")).toBeOnTheScreen();
  });

  it("on iPad, shows the first section beside the list and swaps it in place", async () => {
    wide(true);
    index();
    expect(await screen.findByTestId("settings-page-general")).toBeOnTheScreen();
    expect(screen.getByTestId("settings-general")).toBeSelected();
    // The open section titles itself under the "Settings" header.
    expect(screen.getAllByText("General").length).toBeGreaterThan(0);
    await act(async () => fireEvent.press(screen.getByTestId("settings-policies")));
    expect(await screen.findByTestId("settings-page-policies")).toBeOnTheScreen();
    expect(screen.queryByTestId("settings-page-general")).toBeNull();
    // Picking the open one again does nothing.
    await act(async () => fireEvent.press(screen.getByTestId("settings-policies")));
    expect(screen.getByTestId("settings-page-policies")).toBeOnTheScreen();
  });

  it("on iPad, asks before leaving a section with unsaved changes", async () => {
    wide(true);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "cancel")?.onPress?.();
    });
    index();
    fireEvent.changeText(await screen.findByTestId("general-name"), "Something else");
    await act(async () => fireEvent.press(screen.getByTestId("settings-policies")));
    expect(alert.mock.calls[0]?.[0]).toBe("Discard changes?");
    expect(screen.getByTestId("settings-page-general")).toBeOnTheScreen();
  });
});

describe("SettingsSectionRoute", () => {
  const route = (segment: string, role: MemberRole = "owner") =>
    renderBusinessScreen(<SettingsSectionRoute segment={segment} />, { path: `settings/${segment}`, role });

  it("on phones, shows the section to members with its role", async () => {
    wide(false);
    const view = route("payments");
    expect(await screen.findByTestId("settings-page-payments")).toBeOnTheScreen();
    view.unmount();

    route("payments", "admin");
    expect(await screen.findByTestId("forbidden")).toBeOnTheScreen();
  });

  it("on iPad, opens the master–detail on that section", async () => {
    wide(true);
    route("payments");
    expect(await screen.findByTestId("settings-page-payments")).toBeOnTheScreen();
    expect(screen.getByTestId("settings-payments")).toBeSelected();
  });

  it("renders nothing for an unknown section", () => {
    wide(false);
    route("nope");
    expect(screen.queryByTestId(/settings-page/)).toBeNull();
  });
});
