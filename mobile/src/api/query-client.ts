/**
 * The app's TanStack Query client: the website's defaults (`@shared/api/query-defaults`), a longer memory so the
 * persisted cache is worth restoring, and React Native's notion of focus (the app coming to the foreground) and of
 * being online (expo-network).
 */
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { QUERY_DEFAULTS } from "@shared/api/query-defaults";

/** How long an unused query stays in memory and in the persisted cache. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      ...QUERY_DEFAULTS,
      queries: { ...QUERY_DEFAULTS.queries, gcTime: CACHE_MAX_AGE_MS },
    },
  });
}

let wired = false;

/** Refetch stale queries when the app returns to the foreground or the network comes back. Idempotent. */
export function wireFocusAndOnline() {
  if (wired) return;
  wired = true;
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) =>
      setFocused(status === "active"),
    );
    return () => subscription.remove();
  });
  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => subscription.remove();
  });
}
