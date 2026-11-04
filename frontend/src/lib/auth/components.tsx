"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Me } from "@/lib/api/types";
import { configuredOrigin } from "@/lib/oauth/app-url";
import { AFTER_SIGN_IN_PATH, SIGN_IN_PATH } from "./config";
import { useAuth } from "./context";

/** Renders children only when signed in (nothing while loading). */
export function SignedIn({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <>{children}</> : null;
}

/** Renders children only when signed out (nothing while loading). */
export function SignedOut({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && !isSignedIn ? <>{children}</> : null;
}

const SAME_ORIGIN = "http://same-origin.invalid";

/** This app's own origins: the browser's (on the client) and the configured one. */
function ownOrigins(): string[] {
  const origins = typeof window !== "undefined" ? [window.location.origin] : [];
  const configured = configuredOrigin();
  return configured ? [...origins, configured] : origins;
}

/**
 * Only allow same-origin redirect targets: a relative path, or an absolute URL on this app's origin (Clerk sends
 * signed-out visitors to sign-in with the page they wanted as one), whose path is used. The path is resolved the way
 * the router will resolve it, so tricks the URL parser undoes ("/\t/evil.example" drops the tab and becomes
 * "//evil.example") are caught; the normalised path is returned.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value, SAME_ORIGIN);
  } catch {
    return null;
  }
  const allowed = value.startsWith("/") ? [SAME_ORIGIN] : ownOrigins();
  if (!allowed.includes(url.origin)) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith(SIGN_IN_PATH) || path.startsWith("/sign-up")) return null;
  return path;
}

export function signInUrl(redirectTo?: string | null) {
  const safe = safeRedirectPath(redirectTo ?? null);
  return safe ? `${SIGN_IN_PATH}?redirect_url=${encodeURIComponent(safe)}` : SIGN_IN_PATH;
}

/**
 * The post-auth router, which goes on to [redirectTo] when it is safe, else to the user's home; after a sign-up
 * without one ([signUp]), to onboarding unless the account turns out to be a member already.
 */
export function afterSignInUrl(redirectTo?: string | null, { signUp = false }: { signUp?: boolean } = {}) {
  const safe = safeRedirectPath(redirectTo ?? null);
  if (safe) return `${AFTER_SIGN_IN_PATH}?redirect_url=${encodeURIComponent(safe)}`;
  return signUp ? `${AFTER_SIGN_IN_PATH}?intent=sign-up` : AFTER_SIGN_IN_PATH;
}

/**
 * A signed-in user's home: the dashboard for members, My bookings for customers who have booked, else onboarding
 * (someone with neither has most likely come to set up a business).
 */
export function accountHomePath(me: Pick<Me, "memberships" | "hasCustomerBookings">): string {
  if (me.memberships.length > 0) return "/dashboard";
  return me.hasCustomerBookings ? "/my/bookings" : "/onboarding";
}

/**
 * Where to go after sign-in: explicit redirect, else the user's home (My bookings while unknown). After a sign-up
 * ([signUp]) the home of anyone who isn't a member yet is onboarding.
 */
export function resolvePostSignInPath(
  me: Pick<Me, "memberships" | "hasCustomerBookings"> | null,
  redirectUrl?: string | null,
  { signUp = false }: { signUp?: boolean } = {},
): string {
  const safe = safeRedirectPath(redirectUrl);
  if (safe) return safe;
  if (signUp && !me?.memberships.length) return "/onboarding";
  return me ? accountHomePath(me) : "/my/bookings";
}

/**
 * Client-side route guard (dev auth; also a safety net with Clerk, where the
 * protected layouts call `protectRoute()` server-side). Shows `fallback` until auth is known and
 * redirects signed-out users to /sign-in?redirect_url=<current>.
 */
export function RequireAuth({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={fallback}>
      <RequireAuthInner fallback={fallback}>{children}</RequireAuthInner>
    </Suspense>
  );
}

function RequireAuthInner({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const qs = search.toString();
      router.replace(signInUrl(`${pathname}${qs ? `?${qs}` : ""}`));
    }
  }, [isLoaded, isSignedIn, pathname, search, router]);

  if (!isLoaded || !isSignedIn) return <>{fallback}</>;
  return <>{children}</>;
}
