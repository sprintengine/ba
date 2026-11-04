import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { assistantAction, assistantActionSparse } from "@shared/api/__tests__/fixtures/assistant";
import type { AgentRequest, AssistantAction } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { ApprovalScreen, ApprovalsScreen } from "./ApprovalsScreen";

const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const request = (action: Partial<AssistantAction>, patch: Partial<AgentRequest> = {}): AgentRequest => ({
  action: { ...assistantActionSparse, ...action } as AssistantAction,
  app: "Claude",
  needsApproval: true,
  appDisconnected: false,
  ...patch,
});

const waiting = request({
  id: id(1),
  proposal: {
    title: "Move Rowan's appointment",
    summary: "Tuesday 6 October",
    changes: [
      { label: "Time", before: "13:00", after: "15:00" },
      { label: "Note", before: null, after: "Running late" },
      { label: "Room", before: "Room 2", after: null },
    ],
    items: [{ title: "Rowan Example", detail: "Physio, 45 min" }],
    warnings: ["Rowan is told by email."],
    confirmLabel: "Move appointment",
    destructive: false,
  },
});
const done = request({
  ...assistantAction,
  id: id(2),
  result: {
    message: "Moved.",
    links: [
      { label: "Open calendar", path: "calendar?date=2026-10-06" },
      { label: "Pay now", path: "https://pay.example.test/x" },
    ],
  },
});

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1180 : 390, height: 820 });
}

function api(items: AgentRequest[], extra?: (m: string, p: string) => unknown) {
  return mockApi((method, path) => {
    const custom = extra?.(method, path);
    if (custom !== undefined) return custom;
    if (path === `${B}/agent-requests`) return { items };
    const one = items.find((r) => path === `${B}/agent-requests/${r.action.id}`);
    if (one && method === "GET") return one;
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    return undefined;
  });
}

describe("ApprovalsScreen", () => {
  beforeEach(() => wide(false));

  it("lists what's waiting and what was decided this week", async () => {
    api([waiting, done]);
    renderOpsScreen(<ApprovalsScreen />);
    const pending = await screen.findByTestId("approvals-waiting");
    expect(within(pending).getByText("Move Rowan's appointment")).toBeOnTheScreen();
    expect(within(pending).getByText("Needs your OK")).toBeOnTheScreen();
    expect(within(pending).getByLabelText("Time: 13:00 to 15:00")).toBeOnTheScreen();
    expect(within(pending).getByLabelText("Note: Running late")).toBeOnTheScreen();
    expect(within(pending).getByLabelText("Room: Room 2 removed")).toBeOnTheScreen();
    expect(within(pending).getByText("Physio, 45 min")).toBeOnTheScreen();
    expect(within(pending).getByText("Rowan is told by email.")).toBeOnTheScreen();
    expect(within(pending).getByText(/^From Claude · /)).toBeOnTheScreen();
    expect(within(pending).getByText("until 11:15")).toBeOnTheScreen();
    const decided = screen.getByTestId("approvals-decided");
    expect(within(decided).getByText("Done")).toBeOnTheScreen();
    expect(within(decided).getByText("Moved.")).toBeOnTheScreen();
    expect(
      within(decided).getByText("You can go back to Claude: it can see that this went ahead."),
    ).toBeOnTheScreen();
  });

  it("approves a request", async () => {
    let current = waiting;
    const fetch = api([waiting], (method, path) => {
      if (method === "POST" && path === `${B}/agent-requests/${waiting.action.id}/approve`) {
        current = {
          ...waiting,
          action: { ...waiting.action, status: "confirmed", result: { message: "Moved.", links: [] } },
        };
        return current;
      }
      if (path === `${B}/agent-requests`) return { items: [current] };
      return undefined;
    });
    renderOpsScreen(<ApprovalsScreen />);
    fireEvent.press(await screen.findByTestId("approve-request"));
    expect(await screen.findByText("Approved")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`POST ${B}/agent-requests/${waiting.action.id}/approve`);
    expect(await screen.findByText("Moved.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("approve-request")).toBeNull());
  });

  it("declines a request", async () => {
    let current = waiting;
    const fetch = api([waiting], (method, path) => {
      if (method === "POST" && path.endsWith("/decline")) {
        current = { ...waiting, action: { ...waiting.action, status: "rejected" } };
        return current;
      }
      if (path === `${B}/agent-requests`) return { items: [current] };
      return undefined;
    });
    renderOpsScreen(<ApprovalsScreen />);
    fireEvent.press(await screen.findByTestId("decline-request"));
    expect(await screen.findByText("Declined. Nothing changed.")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`POST ${B}/agent-requests/${waiting.action.id}/decline`);
  });

  it("shows why an approval was refused", async () => {
    api([waiting], (method, path) =>
      method === "POST" && path.endsWith("/approve")
        ? apiError(409, "CONFLICT", "It changed since")
        : undefined,
    );
    renderOpsScreen(<ApprovalsScreen />);
    fireEvent.press(await screen.findByTestId("approve-request"));
    expect(await screen.findByTestId("proposal-error")).toHaveTextContent("It changed since");
  });

  it("can't approve what a disconnected app asked for", async () => {
    api([request({ id: id(3) }, { appDisconnected: true })]);
    renderOpsScreen(<ApprovalsScreen />);
    expect(await screen.findByTestId("app-disconnected")).toBeOnTheScreen();
    expect(screen.queryByTestId("approve-request")).toBeNull();
  });

  it("says when the app may also go ahead itself", async () => {
    api([request({ id: id(4) }, { needsApproval: false })]);
    renderOpsScreen(<ApprovalsScreen />);
    expect(await screen.findByText(/Claude can also go ahead once you say yes there/)).toBeOnTheScreen();
  });

  it("explains failed and expired requests", async () => {
    api([
      request({ id: id(5), status: "failed", error: "The slot was taken." }),
      request({ id: id(6), status: "failed", error: null }),
      request({ id: id(7), status: "expired" }),
    ]);
    renderOpsScreen(<ApprovalsScreen />);
    expect(await screen.findByText("The slot was taken. Ask Claude to try again.")).toBeOnTheScreen();
    expect(screen.getByText("This couldn't be completed. Ask Claude to try again.")).toBeOnTheScreen();
    expect(
      screen.getByText("This proposal expired before it was confirmed, so nothing changed."),
    ).toBeOnTheScreen();
  });

  it("opens a result's links: in the dashboard, or outside the app", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    api([done]);
    const app = renderOpsScreen(<ApprovalsScreen />, {
      routes: { "dashboard/[slug]/calendar": () => <></> },
    });
    fireEvent.press(await screen.findByRole("button", { name: "Pay now" }));
    expect(open).toHaveBeenCalledWith("https://pay.example.test/x");
    fireEvent.press(screen.getByRole("button", { name: "Open calendar" }));
    await waitFor(() => expect(app.getPathname()).toBe("/dashboard/lumen-physio/calendar"));
    expect(app.getSearchParams()).toMatchObject({ date: "2026-10-06" });
  });

  it("points to connecting an agent when there's nothing", async () => {
    api([]);
    renderOpsScreen(<ApprovalsScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Connect your agent" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\/help\/ai-agents-for-business$/),
    );
  });

  it("shows the API's error with a retry", async () => {
    mockApi((_m, path) => (path === `${B}/agent-requests` ? apiError(500, "INTERNAL", "Boom") : undefined));
    renderOpsScreen(<ApprovalsScreen />);
    expect(await screen.findByText("Boom")).toBeOnTheScreen();
  });
});

describe("ApprovalScreen", () => {
  beforeEach(() => wide(false));

  /** `/dashboard/lumen-physio/approvals/{requestId}`, as an AI app's `approvalUrl` or a notification opens it. */
  function renderApproval(requestId: string) {
    renderOpsScreen(<></>, { routes: { "dashboard/[slug]/approvals/[id]": () => <ApprovalScreen /> } });
    act(() => router.push(`/dashboard/lumen-physio/approvals/${requestId}` as Href));
  }

  it("shows the one request an app or notification links to", async () => {
    api([waiting]);
    renderApproval(waiting.action.id);
    expect(await screen.findByTestId(`proposal-${waiting.action.id}`)).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Claude wants to make this change at Lumen Physiotherapy. Nothing happens until you approve it.",
      ),
    ).toBeOnTheScreen();
  });

  it("shows the API's error", async () => {
    mockApi((_m, path) =>
      path.includes("/agent-requests/") ? apiError(500, "INTERNAL", "Boom") : undefined,
    );
    renderApproval(id(9));
    expect(await screen.findByText("Boom")).toBeOnTheScreen();
    expect(screen.getByText(/^Your AI agent wants to make this change/)).toBeOnTheScreen();
  });
});
