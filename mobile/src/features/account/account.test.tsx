import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { me as meFixture, teamMember } from "@shared/api/__tests__/fixtures/business";
import { connectedApp, connectedAppSparse } from "@shared/api/__tests__/fixtures/marketplace";
import { notificationSettings } from "@shared/api/__tests__/fixtures/notifications";
import type { NotificationSettings, TeamMember } from "@shared/api/types";
import { AccountDeletionError, AccountDeletionProvider, REVERIFY_MESSAGE } from "~/auth/account-deletion";
import { apiError, calls, mockApi, pending } from "~/test/api-mock";
import { authState, renderScreen } from "~/test/render";
import { ConnectedAppsScreen, urlHost } from "~/features/connected-apps/ConnectedAppsScreen";
import { nextAutoApprove } from "~/features/connected-apps/AgentSettings";
import { AccountScreen, emailKinds } from "./AccountScreen";
import { confirmsDeletion } from "./DeleteAccountSheet";

const settings: NotificationSettings = {
  items: [
    ...notificationSettings.items,
    {
      kind: "agent_approval",
      label: "AI app approvals",
      description: "An AI app asks you to approve a change.",
      email: true,
      forMembers: true,
      forCustomers: true,
    },
  ],
};

function api(extra: (method: string, path: string, body: unknown) => unknown = () => undefined) {
  return mockApi((method, path, body) => {
    if (path === "/v1/me") return { ...meFixture, pendingInvitations: [] };
    if (path === "/v1/me/notification-settings" && method === "GET") return settings;
    if (path === "/v1/me/agent-settings" && method === "GET") return { autoApprove: [] };
    return extra(method, path, body);
  });
}

describe("AccountScreen", () => {
  it("shows who's signed in, their businesses and the settings", async () => {
    api();
    renderScreen(<AccountScreen />);
    expect(await screen.findByText(meFixture.user.email)).toBeOnTheScreen();
    expect(await screen.findByTestId(`account-business-${meFixture.memberships[0]!.slug}`)).toBeOnTheScreen();
    // A member sees the team's kinds too.
    expect(await screen.findByTestId("email-new_booking")).toBeOnTheScreen();
    expect(screen.getByTestId("email-agent_approval")).toBeOnTheScreen();
    expect(screen.getByTestId("agent-settings")).toBeOnTheScreen();
  });

  it("changes which notifications are emailed", async () => {
    const calls: unknown[] = [];
    api((method, path, body) => {
      if (method === "PATCH" && path === "/v1/me/notification-settings") {
        calls.push(body);
        return settings;
      }
      return undefined;
    });
    renderScreen(<AccountScreen />);
    fireEvent(await screen.findByTestId("email-agent_approval"), "valueChange", false);
    await waitFor(() => expect(calls).toEqual([{ email: { agent_approval: false } }]));
    expect(await screen.findByText("No more emails for these")).toBeOnTheScreen();
  });

  it("lets AI apps book without asking once said yes there", async () => {
    const patches: unknown[] = [];
    api((method, path, body) => {
      if (method === "PATCH" && path === "/v1/me/agent-settings") {
        patches.push(body);
        return { autoApprove: ["bookings"] };
      }
      return undefined;
    });
    renderScreen(<AccountScreen />);
    fireEvent(await screen.findByTestId("auto-approve-bookings"), "valueChange", true);
    await waitFor(() => expect(patches).toEqual([{ autoApprove: ["bookings"] }]));
  });

  it("opens the legal pages, and the deletion email when the app can't delete the account", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    api();
    renderScreen(<AccountScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Privacy notice" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(expect.stringMatching(/\/legal\/privacy$/));
    fireEvent.press(screen.getByTestId("delete-account-email"));
    expect(Linking.openURL).toHaveBeenCalledWith(
      "mailto:hello@bookanything.ie?subject=Delete%20my%20bookanything%20account",
    );
  });

  it("shows the settings' error", async () => {
    mockApi((_m, path) =>
      path === "/v1/me/notification-settings"
        ? apiError(500, "INTERNAL_SERVER_ERROR", "Settings broke.")
        : undefined,
    );
    renderScreen(<AccountScreen />);
    expect(await screen.findByText("Settings broke.")).toBeOnTheScreen();
  });

  it("filters the email kinds by who the person is", () => {
    expect(emailKinds(settings.items, false).map((k) => k.kind)).toEqual(["agent_approval"]);
    expect(emailKinds(settings.items, true).map((k) => k.kind)).toEqual(["new_booking", "agent_approval"]);
    expect(nextAutoApprove(["cancellations"], "bookings", true)).toEqual(["bookings", "cancellations"]);
    expect(nextAutoApprove(["bookings", "cancellations"], "bookings", false)).toEqual(["cancellations"]);
  });
});

describe("deleting the account", () => {
  const owner: TeamMember = { ...teamMember, role: "owner", userId: meFixture.user.id };
  const deleteAccount = jest.fn<Promise<void>, []>(() => Promise.resolve());

  function render(team: () => unknown = () => [owner], auth = authState()) {
    api((_method, path) => (path.endsWith("/team") ? team() : undefined));
    renderScreen(
      <AccountDeletionProvider value={{ available: true, deleteAccount }}>
        <AccountScreen />
      </AccountDeletionProvider>,
      { auth },
    );
  }

  async function open() {
    // Once /me has said who they are and their businesses.
    await screen.findByTestId(`account-business-${meFixture.memberships[0]!.slug}`);
    fireEvent.press(screen.getByTestId("delete-account-open"));
    expect(await screen.findByTestId("delete-account-sheet")).toBeOnTheScreen();
  }

  beforeEach(() => deleteAccount.mockClear());

  it("says what happens, asks for DELETE, then deletes", async () => {
    render();
    await open();
    expect(screen.getByTestId("delete-account-consequences")).toHaveTextContent(
      /Your bookings aren't cancelled\. The businesses you booked with keep their own records of them/,
    );
    expect(screen.getByText(/removed from the team of every business/)).toBeOnTheScreen();
    expect(screen.getByTestId("delete-account-submit")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("delete-account-confirm"), "DELET");
    expect(screen.getByTestId("delete-account-submit")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("delete-account-confirm"), "DELETE");
    fireEvent.press(screen.getByTestId("delete-account-submit"));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Your account was deleted")).toBeOnTheScreen();
  });

  it("warns the only owner that their business will be suspended", async () => {
    render();
    await open();
    expect(await screen.findByText(`${meFixture.memberships[0]!.name} will be suspended`)).toBeOnTheScreen();
    expect(screen.getByText(/You're its only owner\. Its booking page goes offline/)).toBeOnTheScreen();
  });

  it("doesn't warn an owner who isn't the only one", async () => {
    render(() => [owner, { ...owner, id: "m2", userId: "u2", email: "sam@example.test" }]);
    await open();
    await waitFor(() => expect(screen.queryByTestId("delete-account-owner-lumen-physio")).toBeNull());
  });

  it("warns with an 'if' until it knows the business's owners", async () => {
    render(pending);
    await open();
    expect(
      screen.getByText(`If you're the only owner of ${meFixture.memberships[0]!.name}, it will be suspended`),
    ).toBeOnTheScreen();
  });

  it("explains a sign-in too old for deleting, with Sign out", async () => {
    const auth = authState();
    deleteAccount.mockRejectedValueOnce(new AccountDeletionError("reverify", REVERIFY_MESSAGE));
    render(undefined, auth);
    await open();
    fireEvent.changeText(screen.getByTestId("delete-account-confirm"), meFixture.user.email.toUpperCase());
    fireEvent.press(screen.getByTestId("delete-account-submit"));
    expect(await screen.findByTestId("delete-account-error")).toHaveTextContent(/needs a recent sign-in/);
    fireEvent.press(screen.getByTestId("delete-account-sign-out"));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("shows any other failure", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("boom"));
    render();
    await open();
    fireEvent.changeText(screen.getByTestId("delete-account-confirm"), "delete");
    fireEvent.press(screen.getByTestId("delete-account-submit"));
    expect(await screen.findByText("We couldn't delete your account. Please try again.")).toBeOnTheScreen();
    expect(screen.getByTestId("delete-account-submit")).toBeEnabled();
  });

  it("confirms with DELETE or the email", () => {
    expect(confirmsDeletion(" delete ", null)).toBe(true);
    expect(confirmsDeletion("Avery@Example.test", "avery@example.test")).toBe(true);
    expect(confirmsDeletion("", "avery@example.test")).toBe(false);
    expect(confirmsDeletion("del", null)).toBe(false);
  });
});

describe("ConnectedAppsScreen", () => {
  it("lists apps with what they may do, and disconnects one after asking", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const fetch = api((method, path) => {
      if (path === "/v1/me/connected-apps" || path === "/v1/oauth/connected-apps")
        return [
          connectedApp,
          {
            ...connectedAppSparse,
            id: "x2",
            name: "ChatGPT",
            redirectHost: "chatgpt.com",
            audience: "business",
          },
        ];
      if (method === "DELETE" || method === "POST") return new Response(null, { status: 204 });
      return undefined;
    });
    renderScreen(<ConnectedAppsScreen />);
    expect(await screen.findByTestId(`app-${connectedApp.id}`)).toBeOnTheScreen();
    expect(screen.getByText("Returns to claude.ai")).toBeOnTheScreen();
    expect(screen.getByText("Your businesses")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(await screen.findByText("Claude disconnected")).toBeOnTheScreen();
    expect(calls(fetch).some((c) => /^(DELETE|POST) /.test(c) && c.includes(connectedApp.id))).toBe(true);
  });

  it("says when no app is connected, with how to connect one", async () => {
    const app = (() => {
      api((_m, path) => (path.endsWith("connected-apps") ? [] : undefined));
      return renderScreen(<ConnectedAppsScreen />, { routes: { "connect-ai": () => <></> } });
    })();
    fireEvent.press(await screen.findByRole("button", { name: "Use bookanything in your AI assistant" }));
    await waitFor(() => expect(app.getPathname()).toBe("/connect-ai"));
  });

  it("shows the API's error", async () => {
    mockApi(() => apiError(500, "INTERNAL_SERVER_ERROR", "Apps broke."));
    renderScreen(<ConnectedAppsScreen />);
    expect(await screen.findByText("Apps broke.")).toBeOnTheScreen();
  });

  it("shows a website's host", () => {
    expect(urlHost("https://claude.ai/x")).toBe("claude.ai");
    expect(urlHost(null)).toBeNull();
    expect(urlHost("not a url")).toBeNull();
  });
});
