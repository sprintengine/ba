"use client";

import { ClerkAuthProvider } from "./clerk-auth-provider";
import { CLERK_ENABLED } from "./config";
import { DevAuthProvider } from "./dev-auth-provider";

/** Mounted once in the root providers. Chooses Clerk or dev auth from the environment. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return CLERK_ENABLED ? (
    <ClerkAuthProvider>{children}</ClerkAuthProvider>
  ) : (
    <DevAuthProvider>{children}</DevAuthProvider>
  );
}
