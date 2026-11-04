import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Share, View } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { apiError, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { AiAgentsSettings } from "./AiAgentsSettings";

const PATH = `/v1/businesses/${business.id}`;

function api(patch?: () => unknown) {
  const patches: unknown[] = [];
  mockApi((method, path, body) => {
    if (method === "PATCH" && path === PATH) {
      patches.push(body);
      return patch ? patch() : { ...business, ...(body as object) };
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { patches };
}

const render = (options: Parameters<typeof renderBusinessScreen>[1] = {}) =>
  renderBusinessScreen(<AiAgentsSettings />, {
    path: "settings/ai-agents",
    routes: {
      "connect-ai": () => <View testID="connect-ai-screen" />,
      "dashboard/[slug]/approvals/index": () => <View testID="approvals-screen" />,
    },
    ...options,
  });

describe("Settings › AI agents", () => {
  it("shows who can use agents and what goes ahead without approval", async () => {
    api();
    render();
    expect(await screen.findByTestId("ai-access-team")).toBeChecked();
    expect(screen.getByTestId("ai-access-admins")).not.toBeChecked();
    expect(screen.getByTestId("ai-auto-records")).toBeChecked();
    expect(screen.getByTestId("ai-auto-time_off")).toBeChecked();
    expect(screen.getByTestId("ai-auto-cancellations")).not.toBeChecked();
    // In the business's words.
    expect(screen.getByText("Notes on appointments, adding and editing patients.")).toBeOnTheScreen();
    expect(screen.getByTestId("ai-server-url")).toHaveTextContent(/\/mcp\/business$/);
    expect(screen.queryByText("Only an owner can change this.")).toBeNull();
  });

  it("lets an owner change who can use agents", async () => {
    const { patches } = api();
    render();
    fireEvent.press(await screen.findByTestId("ai-access-off"));
    await waitFor(() => expect(patches).toEqual([{ aiAgentsAccess: "off" }]));
    expect(await screen.findByText("Saved who can use AI agents")).toBeOnTheScreen();
  });

  it("adds and removes kinds of change, keeping the website's order", async () => {
    const { patches } = api();
    render();
    fireEvent.press(await screen.findByTestId("ai-auto-bookings"));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ aiAgentsAutoApprove: ["records", "bookings", "time_off"] });
    expect(await screen.findByText("Agents can make these without approval")).toBeOnTheScreen();

    // Locked while saving.
    await waitFor(() => expect(screen.getByTestId("ai-auto-records")).toBeEnabled());
    fireEvent.press(screen.getByTestId("ai-auto-records"));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({ aiAgentsAutoApprove: ["time_off"] });
    expect(await screen.findByText("These need approval again")).toBeOnTheScreen();
  });

  it("says when saving fails", async () => {
    api(() => apiError(403, "FORBIDDEN", "Only owners can change this"));
    render();
    fireEvent.press(await screen.findByTestId("ai-access-admins"));
    expect(await screen.findByText("Only owners can change this")).toBeOnTheScreen();
  });

  it("shows admins the rules without letting them change them", async () => {
    const { patches } = api();
    render({ role: "admin" });
    expect(await screen.findAllByText("Only an owner can change this.")).toHaveLength(2);
    expect(screen.getByTestId("ai-access-off")).toBeDisabled();
    fireEvent.press(screen.getByTestId("ai-access-off"));
    expect(patches).toEqual([]);
  });

  it("shares the server address and opens the guide, requests and connected apps", async () => {
    api();
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    render();
    fireEvent.press(await screen.findByTestId("ai-share-url"));
    expect(share).toHaveBeenCalledWith({ message: expect.stringMatching(/\/mcp\/business$/) });

    fireEvent.press(screen.getByTestId("ai-help"));
    expect(await screen.findByTestId("connect-ai-screen")).toBeOnTheScreen();
  });

  it("opens the agents' requests", async () => {
    api();
    render();
    fireEvent.press(await screen.findByTestId("ai-requests"));
    expect(await screen.findByTestId("approvals-screen")).toBeOnTheScreen();
  });

  it("says when agents aren't available on this deployment", async () => {
    api();
    render({ business: { aiAgentsAvailable: false } });
    expect(await screen.findByTestId("ai-agents-unavailable")).toBeOnTheScreen();
    expect(screen.queryByTestId("ai-access")).toBeNull();
  });
});
