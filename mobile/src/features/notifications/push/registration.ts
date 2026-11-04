/**
 * Telling the backend where to push (architecture §22): after sign-in, when the person turned notifications on, and
 * on launch (the token can change; registering again refreshes it), at most once a day for the same person and token.
 * Unregistered before sign-out, while the session still works, so the next person on this phone doesn't get the last
 * one's notifications. When that can't happen (the session expired or was revoked elsewhere, or sign-out couldn't
 * reach the backend), the app, once signed out, turns push off on this device instead ({@link releaseThisDevice}).
 */
import { Platform } from "react-native";
import { notificationsApi } from "@shared/api/notifications";
import { env } from "~/config/env";
import { prefs } from "~/lib/storage";
import { expoPushToken, pushPermission, setBadge, stopPushOnThisDevice } from "./push-device";

/** The token registered with the backend and not unregistered since, for whom, and when. */
const PREF = { token: "push.token", user: "push.user", at: "push.registeredAt" } as const;

/** Registering the same token for the same person again sooner than this is skipped. */
export const REFRESH_MS = 24 * 60 * 60 * 1000;

export type Registration = "registered" | "unchanged" | "no-permission" | "unavailable";

/** A release in progress: registering waits for it, so it doesn't get a token the release then turns off. */
let releasing: Promise<void> | null = null;

/** Registers this device's push token for [userId], if notifications are allowed and the build can have a token. */
export async function registerThisDevice(userId: string, now: number = Date.now()): Promise<Registration> {
  await releasing?.catch(() => undefined);
  if ((await pushPermission()) !== "granted") return "no-permission";
  const token = await expoPushToken();
  if (!token) return "unavailable";
  const store = prefs();
  const fresh =
    store.getString(PREF.token) === token &&
    store.getString(PREF.user) === userId &&
    now - (store.getNumber(PREF.at) ?? 0) < REFRESH_MS;
  if (fresh) return "unchanged";
  await notificationsApi.registerPushDevice({
    token,
    platform: Platform.OS === "android" ? "android" : "ios",
    appVariant: env.variant,
  });
  store.set(PREF.token, token);
  store.set(PREF.user, userId);
  store.set(PREF.at, now);
  return "registered";
}

/**
 * Stops pushing to this device (before sign-out) and clears the badge. If the backend can't be told (offline), the
 * registration stays stored, and {@link releaseThisDevice} turns push off on this device once signed out.
 */
export async function unregisterThisDevice(): Promise<void> {
  setBadge(0);
  const token = registeredToken();
  if (!token) return;
  await notificationsApi.unregisterPushDevice(token);
  forget();
}

/**
 * Signed out with this device still registered: turns push off on it (the backend then drops it when Expo says it is
 * gone), forgets the registration and clears the badge. If turning it off fails (Android needs the network), the
 * registration stays stored and the next launch tries again. Signing in again registers a fresh token.
 */
export function releaseThisDevice(): Promise<void> {
  releasing ??= (async () => {
    if (!registeredToken()) return;
    setBadge(0);
    await stopPushOnThisDevice();
    forget();
  })().finally(() => {
    releasing = null;
  });
  return releasing;
}

function forget() {
  const store = prefs();
  store.remove(PREF.token);
  store.remove(PREF.user);
  store.remove(PREF.at);
}

/** The token registered with the backend and not unregistered since, if any. */
export function registeredToken(): string | null {
  return prefs().getString(PREF.token) ?? null;
}
