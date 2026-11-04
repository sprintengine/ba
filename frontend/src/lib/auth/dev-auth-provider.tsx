"use client";

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { setAuthTokenGetter } from "@/lib/api/client";
import { AuthContext } from "./context";
import { decodeDevToken, devSignOut, readDevToken, subscribeDevToken } from "./dev-auth";
import type { AuthState } from "./types";

const getServerSnapshot = () => undefined;
const getSnapshot = () => readDevToken();

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  // undefined = not loaded yet (SSR / first hydration pass); null = signed out.
  const token = useSyncExternalStore<string | null | undefined>(
    subscribeDevToken,
    getSnapshot,
    getServerSnapshot,
  );

  // Layout effect: runs before children's passive effects, so the first queries are authenticated.
  useLayoutEffect(() => {
    setAuthTokenGetter(() => readDevToken());
    return () => setAuthTokenGetter(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const identity = token ? decodeDevToken(token) : null;
    return {
      mode: "dev",
      isLoaded: token !== undefined,
      isSignedIn: !!identity,
      user: identity
        ? { id: identity.sub, email: identity.email, name: identity.name || null, imageUrl: null }
        : null,
      getToken: () => Promise.resolve(readDevToken()),
      signOut: (options) => {
        devSignOut();
        if (options?.redirectUrl) window.location.assign(options.redirectUrl);
        return Promise.resolve();
      },
    };
  }, [token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
