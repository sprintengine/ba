import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAuth } from "@shared/auth/context";
import { logError } from "~/lib/logger";
import { pushPermission, requestPushPermission, type PushPermission } from "./push-device";
import { registerThisDevice } from "./registration";

export type PushPermissionState = {
  /** null while it's being read. */
  permission: PushPermission | null;
  /** Asks, then registers this device for the signed-in person. */
  turnOn: () => Promise<void>;
  /** Where a "denied" is undone. */
  openSettings: () => void;
};

/**
 * Whether this device may show notifications, kept current when the person comes back from Settings. Asking happens
 * only when they tap Turn on (never at launch): the inbox and the notifications page explain what they'd get first.
 */
export function usePushPermission(): PushPermissionState {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    let live = true;
    const read = () =>
      void pushPermission()
        .then((p) => live && setPermission(p))
        .catch(() => live && setPermission("denied"));
    read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && read());
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const userId = user?.id;
  const turnOn = useCallback(async () => {
    const p = await requestPushPermission().catch(() => "denied" as const);
    setPermission(p);
    if (p === "granted" && userId) {
      await registerThisDevice(userId).catch((e: unknown) => logError(e, { during: "push-register" }));
    }
  }, [userId]);

  return { permission, turnOn, openSettings: () => void Linking.openSettings() };
}
