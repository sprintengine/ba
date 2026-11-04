/**
 * React Query for the app, with the cache persisted (encrypted MMKV, src/lib/storage) so a cold start shows the
 * last data at once and refreshes it behind. The cache belongs to one person: when the signed-in user changes, it is
 * cleared, in memory and on disk (the website does the same, lib/api/query-provider.tsx).
 */
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, type QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@shared/auth/context";
import { cacheStore, prefs } from "~/lib/storage";
import { CACHE_MAX_AGE_MS, createQueryClient, wireFocusAndOnline } from "./query-client";

const CACHE_OWNER = "cacheOwner";

/** A new app version may change shapes: its cache starts empty. */
const BUSTER = Constants.expoConfig?.version ?? "0";

function createPersister() {
  const store = cacheStore();
  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => store.getString(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => {
        store.remove(key);
      },
    },
    throttleTime: 1000,
  });
}

/** Queries opt out of persistence with `meta: { persist: false }` (one-off or sensitive reads). */
function shouldPersist(query: Parameters<typeof defaultShouldDehydrateQuery>[0]) {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist !== false;
}

export function QueryProvider({ children, client: given }: { children: ReactNode; client?: QueryClient }) {
  const [client] = useState(() => given ?? createQueryClient());
  const [persister] = useState(createPersister);
  const { isLoaded, user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(wireFocusAndOnline, []);

  useEffect(() => {
    if (!isLoaded) return;
    const owner = prefs().getString(CACHE_OWNER) ?? null;
    if (owner !== userId) {
      client.clear();
      void persister.removeClient();
      if (userId) prefs().set(CACHE_OWNER, userId);
      else prefs().remove(CACHE_OWNER);
    }
  }, [client, persister, isLoaded, userId]);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
