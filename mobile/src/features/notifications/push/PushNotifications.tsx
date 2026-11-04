/**
 * Push notifications, app-wide (mounted once in app/_layout.tsx; renders nothing):
 *
 * - while the app is open, a push shows as a banner and the bell refreshes;
 * - tapping one (also from a cold start) marks it read and opens its screen, as the website link would;
 * - signed in with notifications allowed, this device is registered for the person (and unregistered before sign-out);
 * - signed out while still registered (the session expired or was revoked elsewhere, or sign-out was offline), push
 *   is turned off on this device, so the last person's notifications stop arriving;
 * - the app icon's badge is the unread count.
 *
 * Permission is never asked here: the inbox and the notifications page ask, after saying what it's for.
 */
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMarkNotificationRead, useNotifications } from "@shared/api/hooks/use-notifications";
import { qk } from "@shared/api/query-keys";
import { useAuth } from "@shared/auth/context";
import { beforeSignOut } from "~/auth/before-sign-out";
import { logError } from "~/lib/logger";
import { openNotificationLink } from "../open-notification";
import { configureForegroundPresentation, setBadge } from "./push-device";
import { registerThisDevice, releaseThisDevice, unregisterThisDevice } from "./registration";

/** What our pushes carry in `data` (the backend's push job). */
export type PushData = { link?: unknown; notificationId?: unknown; kind?: unknown };

export function PushNotifications() {
  const { isLoaded, isSignedIn, user } = useAuth();
  useEffect(() => {
    configureForegroundPresentation();
  }, []);
  const signedOut = isLoaded && !isSignedIn;
  useEffect(() => {
    if (signedOut) void releaseThisDevice().catch((e: unknown) => logError(e, { during: "push-release" }));
  }, [signedOut]);
  return isSignedIn && user ? <SignedInPush userId={user.id} /> : null;
}

function SignedInPush({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const markRead = useMarkNotificationRead();
  const unread = useNotifications().data?.unreadCount;
  const handled = useRef<string | null>(null);
  const response = Notifications.useLastNotificationResponse();

  // Register now, and whenever the app comes back (notifications may have been allowed in Settings meanwhile).
  useEffect(() => {
    const register = () =>
      void registerThisDevice(userId).catch((e: unknown) => logError(e, { during: "push-register" }));
    register();
    const sub = AppState.addEventListener("change", (s) => s === "active" && register());
    const off = beforeSignOut(unregisterThisDevice);
    return () => {
      sub.remove();
      off();
    };
  }, [userId]);

  // A push arriving while the app is open: the bell and the inbox catch up at once.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications() });
    });
    return () => sub.remove();
  }, [queryClient]);

  // Tapped (now, or the one that launched the app): open what it is about, once.
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = (response.notification.request.content.data ?? {}) as PushData;
    if (typeof data.notificationId === "string") markRead.mutate(data.notificationId);
    if (typeof data.link === "string") openNotificationLink(data.link);
    Notifications.clearLastNotificationResponse();
  }, [response, markRead]);

  useEffect(() => {
    if (unread !== undefined) setBadge(unread);
  }, [unread]);

  return null;
}
