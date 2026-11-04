"use client";

import { useSyncExternalStore } from "react";
import { CLERK_ENABLED } from "./config";
import { decodeDevToken, readDevToken, subscribeDevToken } from "./dev-auth";

/**
 * Whether someone looks signed in, without loading Clerk (about 70 KB) or the auth provider: for pages that only
 * choose between "Sign in" and "Dashboard" (the marketing nav). It is a hint, not a session: a stale one sends the
 * visitor to the dashboard, whose guard sends them on to sign-in.
 *
 * - Clerk keeps `__client_uat` (not httpOnly) on the app's own domain: the time of the last sign-in, `0` once signed
 *   out. Instances that share a domain suffix the name (`__client_uat_<id>`), so any of them counts.
 * - Dev auth keeps its token in localStorage (dev-auth.ts).
 */
export function readSignedInHint(): boolean {
  if (CLERK_ENABLED) return clerkCookieSaysSignedIn(document.cookie);
  const token = readDevToken();
  return !!token && !!decodeDevToken(token);
}

/** Clerk's `__client_uat` (or a suffixed one) in a `document.cookie` string is a sign-in time, not 0. */
export function clerkCookieSaysSignedIn(cookie: string): boolean {
  return cookie.split(";").some((part) => {
    const [name = "", value = ""] = part.trim().split("=");
    return (name === "__client_uat" || name.startsWith("__client_uat_")) && Number(value) > 0;
  });
}

/** Cookies change without an event: look again when the tab comes back (signed in or out elsewhere). */
function subscribe(callback: () => void) {
  const unsubscribeDev = CLERK_ENABLED ? null : subscribeDevToken(callback);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    unsubscribeDev?.();
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

const getSnapshot = () => readSignedInHint();
// Signed out on the server and while hydrating, as the auth provider is before it loads.
const getServerSnapshot = () => false;

/** [readSignedInHint], kept current; false during server rendering and hydration. */
export function useSignedInHint(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
