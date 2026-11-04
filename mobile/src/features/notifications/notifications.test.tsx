import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Text } from "react-native";
import { me as meFixture } from "@shared/api/__tests__/fixtures/business";
import { notification, notificationSettings } from "@shared/api/__tests__/fixtures/notifications";
import type { AppNotification, Me } from "@shared/api/types";
import { runBeforeSignOut } from "~/auth/before-sign-out";
import { calls, mockApi } from "~/test/api-mock";
import { authState, renderScreen } from "~/test/render";
import { NotificationSettingsScreen } from "./NotificationSettingsScreen";
import { NotificationsInbox } from "./NotificationsInbox";
import { PushNotifications } from "./push/PushNotifications";
import { registerThisDevice, registeredToken } from "./push/registration";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
}));

const read: AppNotification = {
  ...notification,
  id: "n2",
  read: true,
  title: "New appointment: Sam Lee",
  link: "/dashboard/lumen-physio/bookings?booking=b9",
};

function api({ items = [notification, read], me = meFixture }: { items?: AppNotification[]; me?: Me } = {}) {
  let list = items;
  return mockApi((method, path, body) => {
    if (path === "/v1/me/notifications")
      return { items: list, unreadCount: list.filter((n) => !n.read).length };
    if (path.endsWith("/read") && method === "POST") {
      list = list.map((n) => (path.includes(n.id) ? { ...n, read: true } : n));
      return new Response(null, { status: 204 });
    }
    if (path === "/v1/me/notifications/read-all") {
      list = list.map((n) => ({ ...n, read: true }));
      return new Response(null, { status: 204 });
    }
    if (path === "/v1/me/notification-settings" && method === "GET") return notificationSettings;
    if (path === "/v1/me/notification-settings" && method === "PATCH")
      return {
        items: notificationSettings.items.map((k) => ({
          ...k,
          email: (body as { email: Record<string, boolean> }).email[k.kind] ?? k.email,
        })),
      };
    if (path === "/v1/me") return me;
    if (path === "/v1/me/push-devices")
      return method === "POST" ? { id: "d1" } : new Response(null, { status: 204 });
    return undefined;
  });
}

const routes = {
  "dashboard/[slug]/approvals/[id]": () => <Text>Approval screen</Text>,
  "dashboard/[slug]/bookings/[id]": () => <Text>Booking screen</Text>,
  "my/approvals/[id]": () => <Text>My approval screen</Text>,
  "my/notifications": () => <Text>Notification settings</Text>,
};

const permission = (status: "granted" | "denied" | "undetermined") =>
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ status, canAskAgain: status !== "denied", granted: status === "granted" } as never);

beforeEach(() => permission("undetermined"));

describe("the inbox", () => {
  it("lists notifications; opening one marks it read and opens its screen", async () => {
    const fetch = api();
    const app = renderScreen(<NotificationsInbox />, { routes });
    expect(await screen.findByText("Claude wants to: Cancel 1 appointment")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Unread\. Claude wants to/ })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`notification-${notification.id}`));
    expect(await screen.findByText("Approval screen")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/dashboard/lumen-physio/approvals/00000000-0000-4000-8000-0000000000a0");
    expect(calls(fetch)).toContain(`POST /v1/me/notifications/${notification.id}/read`);
  });

  it("opens a booking notification on the booking's screen, without marking a read one again", async () => {
    const fetch = api();
    const app = renderScreen(<NotificationsInbox />, { routes });
    fireEvent.press(await screen.findByTestId("notification-n2"));
    expect(await screen.findByText("Booking screen")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/dashboard/lumen-physio/bookings/b9");
    expect(calls(fetch).filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("offers push notifications when they haven't been asked for, and registers on Turn on", async () => {
    const fetch = api();
    // The system prompt: the person allows them.
    jest.mocked(Notifications.requestPermissionsAsync).mockImplementationOnce(() => {
      permission("granted");
      return Promise.resolve({ status: "granted", canAskAgain: true, granted: true } as never);
    });
    renderScreen(<NotificationsInbox />, { routes });
    fireEvent.press(await screen.findByTestId("push-turn-on"));
    await waitFor(() => expect(calls(fetch)).toContain("POST /v1/me/push-devices"));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("push-permission-card")).toBeNull());
  });

  it("says how to turn them on when they were refused, and Not now hides the offer", async () => {
    permission("denied");
    api();
    renderScreen(<NotificationsInbox />, { routes });
    expect(await screen.findByText("Notifications are off")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("push-permission-card")).toBeNull();
  });

  it("is all caught up when there's nothing, and leads to all of them and the email choices", async () => {
    api({ items: [] });
    const app = renderScreen(<NotificationsInbox />, { routes });
    expect(await screen.findByTestId("notifications-empty")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("notification-settings-link"));
    expect(await screen.findByText("Notification settings")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/my/notifications");
  });
});

describe("/my/notifications", () => {
  it("marks everything read and chooses which kinds are emailed (team kinds for members)", async () => {
    const fetch = api();
    renderScreen(<NotificationSettingsScreen />, { routes });
    fireEvent.press(await screen.findByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(calls(fetch)).toContain("POST /v1/me/notifications/read-all"));
    const toggle = await screen.findByTestId("email-new_booking");
    fireEvent(toggle, "valueChange", true);
    await waitFor(() => expect(calls(fetch)).toContain("PATCH /v1/me/notification-settings"));
    expect(await screen.findByText("You'll get these by email")).toBeOnTheScreen();
  });

  it("customers only see the kinds they can get", async () => {
    api({ me: { ...meFixture, memberships: [] } });
    renderScreen(<NotificationSettingsScreen />, { routes });
    expect(await screen.findByText("Email me about")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("email-new_booking")).toBeNull());
  });
});

describe("push notifications", () => {
  it("registers when allowed, keeps the badge at the unread count, and unregisters before sign-out", async () => {
    permission("granted");
    const fetch = api();
    renderScreen(<PushNotifications />, { routes });
    await waitFor(() => expect(calls(fetch)).toContain("POST /v1/me/push-devices"));
    await waitFor(() => expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(1));
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    await act(() => runBeforeSignOut());
    expect(calls(fetch)).toContain("DELETE /v1/me/push-devices");
  });

  it("signed out while still registered (the session ended elsewhere), turns push off on this device", async () => {
    permission("granted");
    const fetch = api();
    await registerThisDevice("dev_customer");
    jest.mocked(Notifications.unregisterForNotificationsAsync).mockClear();
    // Still loading the session: nothing happens yet.
    const loading = renderScreen(<PushNotifications />, {
      routes,
      auth: authState({ isLoaded: false, isSignedIn: false, user: null }),
    });
    await act(async () => undefined);
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
    loading.unmount();

    renderScreen(<PushNotifications />, { routes, auth: authState({ isSignedIn: false, user: null }) });
    await waitFor(() => expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1));
    expect(registeredToken()).toBeNull();
    expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
    expect(calls(fetch)).toEqual(["POST /v1/me/push-devices"]);
  });

  it("a tapped push marks its notification read and opens its screen", async () => {
    const fetch = api();
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue({
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: {
          identifier: "push-1",
          content: { data: { link: "/my/approvals/r1", notificationId: "n7", kind: "agent_approval" } },
        },
      },
    } as never);
    const app = renderScreen(<PushNotifications />, { routes });
    expect(await screen.findByText("My approval screen")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/my/approvals/r1");
    await waitFor(() => expect(calls(fetch)).toContain("POST /v1/me/notifications/n7/read"));
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });

  it("ignores a push link that isn't one of ours", async () => {
    api();
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue({
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: { identifier: "push-2", content: { data: { link: "https://evil.example" } } },
      },
    } as never);
    const app = renderScreen(<PushNotifications />, { routes });
    await act(async () => undefined);
    expect(app.getPathname()).toBe("/");
  });
});
