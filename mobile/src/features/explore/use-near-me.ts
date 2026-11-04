/**
 * Explore's "Near me": the phone's position once, with permission while the app is in use (expo-location). Never
 * throws: a refusal or a failure becomes a message, and the city picker still works.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logError } from "~/lib/logger";

export type NearMeState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; reason: "denied" | "unavailable"; message: string };

export type Coordinates = { latitude: number; longitude: number };

export const NEAR_ME_MESSAGES = {
  denied: "Location access is off for bookanything. Allow it in Settings, or pick a city instead.",
  unavailable: "We couldn't work out where you are. Pick a city instead.",
} as const;

export function useNearMe(onLocated: (coords: Coordinates) => void) {
  const [state, setState] = useState<NearMeState>({ status: "idle" });
  const callback = useRef(onLocated);
  const mounted = useRef(true);
  useEffect(() => {
    callback.current = onLocated;
  }, [onLocated]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback((reason: "denied" | "unavailable") => {
    if (mounted.current) setState({ status: "error", reason, message: NEAR_ME_MESSAGES[reason] });
  }, []);

  const locate = useCallback(async () => {
    setState({ status: "locating" });
    try {
      // Loaded when used (README "Performance rules").
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require("expo-location") as typeof import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return fail("denied");
      // A recent fix is good enough for "near me"; else a fresh one at city-block accuracy.
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (!mounted.current) return;
      setState({ status: "idle" });
      callback.current({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (error) {
      logError(error, { feature: "near-me" });
      fail("unavailable");
    }
  }, [fail]);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);
  return { state, locate, dismiss };
}
