/**
 * This device and push notifications (`expo-notifications`): permission, the Expo push token, the badge, how a
 * notification shows while the app is open, and the Android channel. A thin seam over the native module; tests mock
 * `expo-notifications`.
 *
 * Real delivery needs credentials outside the repo (docs/mobile.md "Push notifications"): the EAS project id (the Expo
 * push token is per project), an APNs key on iOS and an FCM service account on Android, both uploaded with
 * `eas credentials`.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushPermission = "granted" | "denied" | "undetermined";

/** The Android channel every notification uses (the backend sends `channelId: "default"`). */
export const ANDROID_CHANNEL = "default";

/** How notifications show while the app is open: as banners (and in the list), with sound and the badge. */
export function configureForegroundPresentation() {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
  });
  if (Platform.OS === "android") {
    // A locked phone shows only that a notification came (unless the person allows more in Settings). Android keeps a
    // channel's settings once created: changing them later takes a new channel id.
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }).catch(() => undefined);
  }
}

function toPermission(status: Notifications.PermissionStatus | string, canAskAgain: boolean): PushPermission {
  if (status === "granted") return "granted";
  return status === "denied" || !canAskAgain ? "denied" : "undetermined";
}

export async function pushPermission(): Promise<PushPermission> {
  const p = await Notifications.getPermissionsAsync();
  return toPermission(p.status, p.canAskAgain);
}

/** Asks (iOS shows its prompt once; afterwards only Settings can change it). */
export async function requestPushPermission(): Promise<PushPermission> {
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toPermission(p.status, p.canAskAgain);
}

/** The EAS project the Expo push token belongs to (app.config.ts `extra.eas.projectId`, from EAS_PROJECT_ID). */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId || null;
}

/**
 * This install's Expo push token (`ExponentPushToken[…]`), or null when the build can't have one: no EAS project id,
 * or no push service (a simulator without one, missing credentials).
 */
export async function expoPushToken(): Promise<string | null> {
  const projectId = easProjectId();
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/**
 * Stops this install getting pushes: the push service (APNs, FCM) forgets its token, so Expo answers
 * `DeviceNotRegistered` to anyone still sending to its Expo push token, and the backend drops it. Getting a token again
 * ({@link expoPushToken}, when someone registers) turns it back on.
 */
export async function stopPushOnThisDevice(): Promise<void> {
  await Notifications.unregisterForNotificationsAsync();
}

export function setBadge(count: number) {
  void Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
}
