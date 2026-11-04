"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/nextjs";
import { setAuthTokenGetter } from "@/lib/api/client";
import { AFTER_SIGN_IN_PATH, CLERK_PUBLISHABLE_KEY, SIGN_IN_PATH, SIGN_UP_PATH } from "./config";
import { AuthContext } from "./context";
import type { AuthState } from "./types";

/** Clerk styled with our tokens (CSS variables resolve at runtime, so light/dark just work). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorDanger: "var(--danger)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorBackground: "var(--surface-raised)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorNeutral: "var(--foreground)",
    fontFamily: "var(--font-sans)",
    borderRadius: "0.625rem",
  },
  elements: {
    cardBox: "shadow-lg! border! border-border! rounded-2xl!",
    formButtonPrimary: "shadow-button!",
    footer: "bg-surface-sunken!",
  },
};

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const getTokenRef = useRef(getToken);

  useLayoutEffect(() => {
    getTokenRef.current = getToken;
  });
  useLayoutEffect(() => {
    setAuthTokenGetter(() => getTokenRef.current());
    return () => setAuthTokenGetter(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      mode: "clerk",
      isLoaded,
      isSignedIn: !!isSignedIn,
      user: user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? "",
            name: user.fullName ?? null,
            imageUrl: user.imageUrl,
          }
        : null,
      getToken: () => getTokenRef.current(),
      signOut: (options) => clerk.signOut({ redirectUrl: options?.redirectUrl ?? "/" }),
    }),
    [isLoaded, isSignedIn, user, clerk],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={AFTER_SIGN_IN_PATH}
      signUpFallbackRedirectUrl={AFTER_SIGN_IN_PATH}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
