import type { ReactNode } from "react";
import { env } from "~/config/env";
import { DevAuthProvider } from "./DevAuthProvider";

/**
 * Clerk when the build has a publishable key, dev auth otherwise (development builds only: `configProblem` stops a
 * store build without Clerk before this renders). Either way children read `useAuth()` from `@shared/auth/context`,
 * the website's own auth contract.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!env.clerkPublishableKey) return <DevAuthProvider>{children}</DevAuthProvider>;
  // Loaded only when used: Clerk's SDK is large, and dev builds (and tests) never need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClerkAuthProvider } = require("./ClerkAuthProvider") as typeof import("./ClerkAuthProvider");
  return <ClerkAuthProvider publishableKey={env.clerkPublishableKey}>{children}</ClerkAuthProvider>;
}
