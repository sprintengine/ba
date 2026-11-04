import { auth } from "@clerk/nextjs/server";

/**
 * Clerk's server-side helpers need both keys: the proxy installs `clerkMiddleware` only then (src/proxy.ts). Without
 * them we are in dev auth, where tokens live in localStorage and `<RequireAuth>` guards client-side.
 */
export const CLERK_SERVER_ENABLED =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

/**
 * Server-side guard for a protected layout or page (Clerk's resource-based auth checks): signed-out document
 * requests are redirected to sign-in. A no-op in dev auth.
 */
export async function protectRoute(): Promise<void> {
  if (CLERK_SERVER_ENABLED) await auth.protect();
}
