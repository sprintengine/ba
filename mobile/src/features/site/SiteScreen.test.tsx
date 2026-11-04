import { fireEvent, screen } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { renderBusinessScreen } from "~/test/render-business";
import { SiteScreen } from "./SiteScreen";

describe("SiteScreen", () => {
  it("opens the site editor in the system browser through the website's sign-in, not inside the app", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderBusinessScreen(<SiteScreen />, { role: "admin", path: "site" });
    fireEvent.press(await screen.findByRole("button", { name: "Open in your browser" }));
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/\/sign-in\?redirect_url=%2Fdashboard%2Flumen-physio%2Fsite$/),
    );
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it("is for admins and owners", async () => {
    renderBusinessScreen(<SiteScreen />, { role: "staff", path: "site" });
    expect(await screen.findByTestId("forbidden")).toBeOnTheScreen();
  });
});
