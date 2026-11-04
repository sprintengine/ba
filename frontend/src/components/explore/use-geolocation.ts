"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeolocationState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; reason: "denied" | "unavailable" | "timeout" | "unsupported"; message: string };

export type Coordinates = { latitude: number; longitude: number };

const MESSAGES = {
  denied:
    "Location access is turned off for this site. Allow it in your browser settings, or pick a city instead.",
  unavailable: "We couldn't work out where you are. Pick a city instead.",
  timeout: "Finding your location took too long. Try again, or pick a city instead.",
  unsupported: "Your browser can't share your location. Pick a city instead.",
} as const;

function reasonFor(code: number): keyof typeof MESSAGES {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/** One-shot "Near me": asks the browser for the position; never throws when geolocation is missing. */
export function useGeolocation(onLocated: (coords: Coordinates) => void) {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });
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

  const fail = useCallback((reason: keyof typeof MESSAGES) => {
    if (mounted.current) setState({ status: "error", reason, message: MESSAGES[reason] });
  }, []);

  const locate = useCallback(() => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== "function") {
      fail("unsupported");
      return;
    }
    setState({ status: "locating" });
    try {
      geo.getCurrentPosition(
        (position) => {
          if (!mounted.current) return;
          setState({ status: "idle" });
          callback.current({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        (error) => fail(reasonFor(error.code)),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      );
    } catch {
      fail("unavailable");
    }
  }, [fail]);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  return { state, locate, dismiss };
}
