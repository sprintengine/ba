import { ClerkProvider, isClerkAPIResponseError, useAuth as useClerkAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { setAuthTokenGetter } from "@shared/api/client";
import { AuthContext } from "@shared/auth/context";
import type { AuthState } from "@shared/auth/types";
import {
  AccountDeletionError,
  AccountDeletionProvider,
  REVERIFY_MESSAGE,
  type AccountDeletion,
} from "./account-deletion";
import { runBeforeSignOut } from "./before-sign-out";

/**
 * Production auth: Clerk (`@clerk/expo`), its client token in the Keychain (`@clerk/expo/token-cache`, backed by
 * expo-secure-store). API calls send the Clerk session JWT exactly as the website does (architecture §3.1).
 */
export function ClerkAuthProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user } = useUser();

  useLayoutEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  const value = useMemo<AuthState>(
    () => ({
      mode: "clerk",
      isLoaded,
      isSignedIn: !!isSignedIn,
      user: user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? "",
            name: user.fullName,
            imageUrl: user.imageUrl,
          }
        : null,
      getToken: () => getToken(),
      signOut: () => runBeforeSignOut().then(() => signOut()),
    }),
    [isLoaded, isSignedIn, user, getToken, signOut],
  );

  // Needs "Allow users to delete their accounts" in the Clerk dashboard (docs/mobile.md).
  const deletion = useMemo<AccountDeletion>(
    () =>
      user?.deleteSelfEnabled
        ? {
            available: true,
            deleteAccount: async () => {
              try {
                await user.delete();
              } catch (e) {
                throw deletionError(e);
              }
              // The session went with the user: these tasks can only tidy up on the device (the backend forgets
              // the account's push devices itself), then the local sign-out.
              await runBeforeSignOut();
              await signOut().catch(() => undefined);
            },
          }
        : { available: false, reason: "Deleting accounts from the app is switched off at the moment." },
    [user, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      <AccountDeletionProvider value={deletion}>{children}</AccountDeletionProvider>
    </AuthContext.Provider>
  );
}

/** Clerk's refusal in words: a sign-in too old for deleting (reverification), or its own message. */
export function deletionError(e: unknown): AccountDeletionError {
  if (isClerkAPIResponseError(e)) {
    if (e.errors.some((err) => err.code === "session_reverification_required")) {
      return new AccountDeletionError("reverify", REVERIFY_MESSAGE);
    }
    const first = e.errors[0];
    return new AccountDeletionError("failed", first?.longMessage ?? first?.message ?? e.message);
  }
  return new AccountDeletionError(
    "failed",
    "We couldn't delete your account. Check your connection and try again.",
  );
}
