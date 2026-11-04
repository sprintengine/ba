import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { renderRouter } from "expo-router/testing-library";
import { Linking } from "react-native";
import { Providers } from "~/test/render";
import {
  CHATGPT_PLUGINS_URL,
  claudeConnectorLink,
  mcpServerUrl,
  parseServer,
  reachableByAiApps,
} from "./connect-ai";
import { ConnectAiScreen } from "./ConnectAiScreen";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

function renderConnect(server: "customer" | "business") {
  return renderRouter(
    { "connect-ai": () => <ConnectAiScreen />, "my/connected-apps": () => null },
    {
      initialUrl: `/connect-ai?server=${server}`,
      wrapper: ({ children }) => <Providers>{children as never}</Providers>,
    },
  );
}

describe("connect-ai links", () => {
  it("builds the server URLs and Claude's documented install link", () => {
    expect(mcpServerUrl("https://bookanything.ie/", "customer")).toBe("https://bookanything.ie/mcp");
    expect(mcpServerUrl("https://bookanything.ie", "business")).toBe("https://bookanything.ie/mcp/business");
    expect(claudeConnectorLink("bookanything", "https://bookanything.ie/mcp")).toBe(
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=bookanything&connectorUrl=https%3A%2F%2Fbookanything.ie%2Fmcp",
    );
    expect(parseServer("business")).toBe("business");
    expect(parseServer(["x"])).toBe("customer");
    expect(reachableByAiApps("https://bookanything.ie/mcp")).toBe(true);
    expect(reachableByAiApps("http://192.168.1.4:3000/mcp")).toBe(false);
    expect(reachableByAiApps("https://localhost/mcp")).toBe(false);
    expect(reachableByAiApps("not a url")).toBe(false);
  });
});

describe("ConnectAiScreen", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("copies the customer server URL and opens Claude's prefilled dialog", async () => {
    renderConnect("customer");
    const url = "http://localhost:3000/mcp";
    expect(await screen.findByTestId("mcp-server-url")).toHaveTextContent(url);
    // A development address can't be reached by AI apps: said so.
    expect(screen.getByTestId("unreachable-warning")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Copy server URL" }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(url));
    expect(await screen.findByText("Server URL copied")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Add to Claude" }));
    expect(Linking.openURL).toHaveBeenCalledWith(claudeConnectorLink("bookanything", url));
  });

  it("for ChatGPT, copies the URL then opens its plugins (no prefill link exists)", async () => {
    renderConnect("business");
    expect(await screen.findByTestId("mcp-server-url")).toHaveTextContent(
      "http://localhost:3000/mcp/business",
    );
    expect(screen.getByText("Business server URL")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Copy URL and open ChatGPT" }));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(CHATGPT_PLUGINS_URL));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("http://localhost:3000/mcp/business");
  });

  it("says so when the app can't be opened", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    renderConnect("customer");
    fireEvent.press(await screen.findByRole("button", { name: "Add to Claude" }));
    expect(await screen.findByText(/Couldn't open it/)).toBeOnTheScreen();
  });
});
