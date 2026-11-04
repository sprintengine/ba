/**
 * Refresh helpers for screens: pull-to-refresh state that only shows the spinner for a pull (not for background
 * refetches), and a refetch whenever the screen comes back into focus (React Navigation keeps screens mounted).
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

/** `{ refreshing, onRefresh }` for a list's RefreshControl. */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}

/** Refetch (stale queries only, per their staleTime) when the screen regains focus; not on its first focus. */
export function useRefetchOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}
