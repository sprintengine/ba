import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/config";
import { CLERK_SERVER_ENABLED } from "@/lib/auth/server";

/**
 * Next 16 proxy (formerly middleware). With Clerk configured it installs `clerkMiddleware`, which makes the session
 * available to server code; it protects nothing by path. Each protected segment checks auth itself with
 * `protectRoute()` (`app/dashboard`, `app/onboarding` and `app/my` layouts), as Clerk recommends. In dev-auth mode
 * it is a no-op: `<RequireAuth>` guards client-side, because dev tokens live in localStorage.
 *
 * `protectRoute()` sends signed-out visitors to our own sign-in page (not Clerk's hosted one), with the page they
 * wanted as an absolute `redirect_url`, which `safeRedirectPath` accepts when it is on this origin.
 */
const clerkHandler = CLERK_SERVER_ENABLED
  ? clerkMiddleware({ signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH })
  : null;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (clerkHandler) return clerkHandler(request, event);
  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static files and the rewrites to the backend (/api, the customer MCP at /mcp and its
  // OAuth discovery under /.well-known), which carry their own bearer tokens and need no Clerk session.
  matcher: [
    "/((?!_next|api/|mcp(?:/|$)|\\.well-known/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
