"use client";

import { createContext, useContext } from "react";
import type { AuthState } from "./types";

export const AuthContext = createContext<AuthState | null>(null);

/** `{ isLoaded, isSignedIn, user, getToken, signOut, mode }` — works the same with Clerk and dev auth. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
