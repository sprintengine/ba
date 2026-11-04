import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import {
  customerAgentRequest,
  customerAgentRequestSparse,
} from "@shared/api/__tests__/fixtures/notifications";
import type { CustomerAgentRequest } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderScreen } from "~/test/render";
import { ApprovalScreen } from "./ApprovalScreen";
import { ApprovalsScreen } from "./ApprovalsScreen";
import { linkTarget } from "./links";

jest.mock("expo-router", () => {
  const actual = jest.requireActual<typeof import("expo-router")>("expo-router");
  return { ...actual, useLocalSearchParams: jest.fn(() => ({ id: "00000000-0000-4000-8000-0000000000a0" })) };
});

const ID = customerAgentRequestSparse.action.id;
const pending: CustomerAgentRequest = {
  ...customerAgentRequestSparse,
  action: { ...customerAgentRequestSparse.action, expiresAt: "2099-01-01T10:15:00Z" },
};
const booked: CustomerAgentRequest = {
  ...customerAgentRequest,
  action: {
    ...customerAgentRequest.action,
    id: "00000000-0000-4000-8000-0000000000a9",
    tool: "book",
    proposal: { ...customerAgentRequest.action.proposal, title: "Book a massage", destructive: false },
    result: {
      message: "Your time is held. Pay to confirm it.",
      links: [
        { label: "Pay now", path: "https://checkout.stripe.test/c/9" },
        { label: "Your bookings", path: "http://localhost:3000/my/bookings" },
      ],
    },
  },
};

describe("ApprovalsScreen", () => {
  it("lists waiting requests first, then the week's, and approves one", async () => {
    let approved = false;
    const api = mockApi((method, path) => {
      if (path === "/v1/me/agent-requests")
        return {
          items: [
            booked,
            approved ? { ...pending, action: { ...pending.action, status: "confirmed" } } : pending,
          ],
        };
      if (method === "POST" && path === `/v1/me/agent-requests/${ID}/approve`) {
        approved = true;
        return { ...pending, action: { ...customerAgentRequest.action } };
      }
      return undefined;
    });
    renderScreen(<ApprovalsScreen />);
    expect(await screen.findByText("Waiting for you")).toBeOnTheScreen();
    expect(screen.getByText("This week")).toBeOnTheScreen();
    expect(screen.getByText("Needs your OK")).toBeOnTheScreen();
    expect(screen.getByText("Rowan is told by email.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("request-approve"));
    await waitFor(() => expect(calls(api)).toContain(`POST /v1/me/agent-requests/${ID}/approve`));
  });

  it("follows result links: pages in the app, payment in Checkout", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValue({ type: "dismiss" } as never);
    mockApi((_m, path) => (path === "/v1/me/agent-requests" ? { items: [booked] } : undefined));
    const app = renderScreen(<ApprovalsScreen />, { routes: { "my/bookings/index": () => <></> } });
    fireEvent.press(await screen.findByTestId("request-link-Pay now"));
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        "https://checkout.stripe.test/c/9",
        expect.anything(),
      ),
    );
    fireEvent.press(screen.getByTestId("request-link-Your bookings"));
    await waitFor(() => expect(app.getPathname()).toBe("/my/bookings"));
  });

  it("shows why approving failed", async () => {
    mockApi((method, path) => {
      if (path === "/v1/me/agent-requests") return { items: [pending] };
      if (method === "POST") return apiError(409, "CONFLICT", "The price changed. Have a look first.");
      return undefined;
    });
    renderScreen(<ApprovalsScreen />);
    fireEvent.press(await screen.findByTestId("request-approve"));
    expect(await screen.findByText("The price changed. Have a look first.")).toBeOnTheScreen();
  });

  it("says when there is nothing to approve", async () => {
    mockApi((_m, path) => (path === "/v1/me/agent-requests" ? { items: [] } : undefined));
    renderScreen(<ApprovalsScreen />);
    expect(await screen.findByText("Nothing to approve")).toBeOnTheScreen();
  });

  it("shows the API's error", async () => {
    mockApi(() => apiError(500, "INTERNAL_SERVER_ERROR", "Requests broke."));
    renderScreen(<ApprovalsScreen />);
    expect(await screen.findByText("Requests broke.")).toBeOnTheScreen();
  });

  it("explains a disconnected app's request and declines one", async () => {
    const api = mockApi((method, path) => {
      if (path === "/v1/me/agent-requests")
        return {
          items: [
            { ...pending, appDisconnected: true },
            { ...pending, action: { ...pending.action, id: "x2" } },
          ],
        };
      if (method === "POST" && path === "/v1/me/agent-requests/x2/decline")
        return { ...pending, action: { ...pending.action, id: "x2", status: "rejected" } };
      return undefined;
    });
    renderScreen(<ApprovalsScreen />);
    expect(await screen.findByText("Claude was disconnected, so this can't go ahead.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("request-decline"));
    await waitFor(() => expect(calls(api)).toContain("POST /v1/me/agent-requests/x2/decline"));
  });
});

describe("ApprovalScreen", () => {
  it("reads the request fresh and shows it", async () => {
    const api = mockApi((_m, path) => (path === `/v1/me/agent-requests/${ID}` ? pending : undefined));
    renderScreen(<ApprovalScreen />);
    expect(
      await screen.findByText(
        "Claude wants to do this with Lumen Physiotherapy. Nothing happens until you approve it.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId(`request-${ID}`)).toBeOnTheScreen();
    expect(calls(api)).toEqual([`GET /v1/me/agent-requests/${ID}`]);
  });

  it("says what failed and links back to all approvals", async () => {
    mockApi(() => apiError(404, "NOT_FOUND", "Request not found."));
    renderScreen(<ApprovalScreen />);
    expect(await screen.findByText("Request not found.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "All approvals" })).toBeOnTheScreen();
  });
});

describe("result links", () => {
  it("opens the app's own pages in the app and anything else as a payment page", () => {
    expect(linkTarget("/my/bookings", "https://bookanything.ie")).toEqual({
      kind: "app",
      href: "/my/bookings",
    });
    expect(linkTarget("https://bookanything.ie/manage/t?pay=1", "https://bookanything.ie")).toEqual({
      kind: "app",
      href: "/manage/t?pay=1",
    });
    expect(linkTarget("https://bookanything.ie/pricing", "https://bookanything.ie").kind).toBe("payment");
    expect(linkTarget("https://checkout.stripe.com/c/1", "https://bookanything.ie")).toEqual({
      kind: "payment",
      url: "https://checkout.stripe.com/c/1",
    });
  });
});
