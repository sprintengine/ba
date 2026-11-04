"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";
import { QUERY_DEFAULTS } from "./query-defaults";

function makeQueryClient() {
  return new QueryClient({ defaultOptions: QUERY_DEFAULTS });
}

/**
 * One client for the whole browser session. The providers are mounted per route group (app/app-providers.tsx), so
 * marketing pages ship neither, and moving between groups (the dashboard, My bookings, a business's page) remounts
 * them: the cache must survive that. On the server each render gets its own client, so no data is shared between
 * requests.
 */
let browserClient: QueryClient | null = null;
/** Whose data the browser client holds: a user id, null when signed out, undefined until auth is first known. */
let cacheOwner: string | null | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserClient ??= makeQueryClient());
}

/** Tests only: the next provider starts with a new, empty client and no known user. */
export function resetQueryClientForTests() {
  browserClient?.clear();
  browserClient = null;
  cacheOwner = undefined;
}

/**
 * TanStack Query for the signed-in app (inside `<AuthProvider>`). Clears the cache when the signed-in user changes,
 * also when it changed while no provider was mounted (signed out from a marketing page, or as another account in
 * another tab): the last user is remembered with the client, not by this instance.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient);
  const { isLoaded, user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isLoaded) return;
    if (cacheOwner !== undefined && cacheOwner !== userId) client.clear();
    cacheOwner = userId;
  }, [client, isLoaded, userId]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * The same client for public pages that need no session (Explore): they read public data only, so they neither know
 * nor change whose data the cache holds.
 */
export function PublicQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
