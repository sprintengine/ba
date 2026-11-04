import { useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { setAuthTokenGetter } from "@shared/api/client";
import { AuthContext } from "@shared/auth/context";
import { decodeDevToken } from "@shared/auth/dev-token";
import type { AuthState } from "@shared/auth/types";
import { AccountDeletionProvider, type AccountDeletion } from "./account-deletion";
import { runBeforeSignOut } from "./before-sign-out";
import { devSignOut, readDevToken, subscribeDevToken } from "./dev-session";

/** Dev sign-ins are made-up identities: there's no account to delete (Clerk builds delete it in the app). */
const NO_DELETION: AccountDeletion = {
  available: false,
  reason: "Development sign-in has no account to delete. Builds that sign in with Clerk delete it here.",
};

/** Dev auth (development builds without Clerk): the same `AuthState` the website's dev mode provides. */
export function DevAuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeDevToken, readDevToken);

  // Before children's effects run, so the first queries are already authenticated.
  useLayoutEffect(() => {
    setAuthTokenGetter(() => readDevToken());
    return () => setAuthTokenGetter(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const identity = token ? decodeDevToken(token) : null;
    return {
      mode: "dev",
      isLoaded: true,
      isSignedIn: !!identity,
      user: identity
        ? { id: identity.sub, email: identity.email, name: identity.name || null, imageUrl: null }
        : null,
      getToken: () => Promise.resolve(readDevToken()),
      signOut: () => runBeforeSignOut().then(devSignOut),
    };
  }, [token]);

  return (
    <AuthContext.Provider value={value}>
      <AccountDeletionProvider value={NO_DELETION}>{children}</AccountDeletionProvider>
    </AuthContext.Provider>
  );
}
