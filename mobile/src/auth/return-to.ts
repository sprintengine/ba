/**
 * Where to go after signing in. A link that needs an account, opened signed out (an invitation, a booking in
 * `/my/…`, a business's dashboard), goes to `/sign-in?returnTo=/invitations/abc` and opens once signed in.
 */
import { router, useGlobalSearchParams, usePathname, useSegments, type Href } from "expo-router";

const MAX_LENGTH = 2048;

/**
 * [value] when it is a path inside the app, else null: it starts with one "/" (no "//host", no scheme), has no
 * backslashes, whitespace or control characters (URL parsers drop or rewrite them: "/\t/evil.example" becomes
 * "//evil.example"), and isn't sign-in itself. A crafted link can't send anyone out of the app or round in circles.
 */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  if (value === "/sign-in" || value.startsWith("/sign-in?") || value.startsWith("/sign-in/")) return null;
  return value;
}

/** Sign-in, coming back to [returnTo] afterwards when it is a safe path. */
export function signInHref(returnTo?: string | null): Href {
  const safe = safeReturnTo(returnTo);
  return safe ? { pathname: "/sign-in", params: { returnTo: safe } } : "/sign-in";
}

/**
 * After signing in: the link that sent the person to sign in, else home (`/` decides). When sign-in was opened over
 * a screen (Sign in from the booking flow or a header), it closes by itself once signed in (the root stack guards
 * it), back to that screen.
 */
export function afterSignIn(returnTo: unknown) {
  const safe = safeReturnTo(returnTo);
  if (safe) router.replace(safe as Href);
  else if (!router.canGoBack()) router.replace("/");
}

/** The current screen's path with its query (`/my/approvals/abc?from=email`), to come back to after sign-in. */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const segments: string[] = useSegments();
  const params = useGlobalSearchParams();
  // `[token]` and `[...rest]` segments' params are in the path already.
  const inPath = new Set(segments.map((s) => /^\[(?:\.\.\.)?(.+)\]$/.exec(s)?.[1]));
  const query = Object.entries(params)
    .filter(([key]) => !inPath.has(key))
    .flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((v) => [key, v ?? ""] as const))
    .map(([key, v]) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}
