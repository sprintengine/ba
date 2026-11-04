"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type InfiniteData,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { ApiError } from "../client";
import type { Page } from "../types";

/** Extra options accepted by every query hook (key and fn are owned by the hook). */
export type QueryOptions<T> = Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">;

/** Extra options accepted by every infinite (cursor-paginated) query hook; its `data` is the loaded items. */
export type InfiniteQueryOptions<T> = Omit<
  UseInfiniteQueryOptions<Page<T>, ApiError, T[], QueryKey, string | null>,
  "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "select"
>;

/**
 * Extra options accepted by every mutation hook. A caller's `onSuccess` runs
 * after the hook's own cache updates/invalidation.
 */
export type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

/** Merge a hook's own precondition (e.g. `!!businessId`) with the caller's `enabled`. */
export function enabledWhen<O extends { enabled?: unknown }>(
  ready: boolean,
  options?: O,
): O["enabled"] | boolean {
  return ready ? (options?.enabled ?? true) : false;
}

/** Shared cursor-pagination settings for `useInfiniteQuery`. */
export const cursorPaging = {
  initialPageParam: null as string | null,
  getNextPageParam: <T>(lastPage: Page<T>) => lastPage.nextCursor,
};

/** An infinite query's `select`: the loaded pages' items as one list (the cache keeps the pages). */
export function loadedItems<T>(data: InfiniteData<Page<T>, string | null>): T[] {
  return data.pages.flatMap((p) => p.items);
}

/**
 * `useMutation` wrapper: runs `onDone` (cache updates + invalidation, awaited
 * so `isPending` stays true until active queries have refetched) and then the
 * caller's `onSuccess`.
 */
export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  onDone?: (queryClient: QueryClient, data: TData, variables: TVariables) => unknown,
  options?: MutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVariables>({
    ...options,
    mutationFn,
    onSuccess: async (...args) => {
      await onDone?.(queryClient, args[0], args[1]);
      return options?.onSuccess?.(...args);
    },
  });
}

/** Invalidate several keys in parallel. */
export function invalidateAll(queryClient: QueryClient, keys: readonly QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Replace an entity (matched by `id`) inside a cached array, if that array is cached. */
export function replaceInList(queryClient: QueryClient, key: QueryKey, entity: { id: string }) {
  queryClient.setQueryData<{ id: string }[]>(key, (list) =>
    list?.map((item) => (item.id === entity.id ? entity : item)),
  );
}

/** Remove an entity (by `id`) from a cached array, if that array is cached. */
export function removeFromList(queryClient: QueryClient, key: QueryKey, id: string) {
  queryClient.setQueryData<{ id: string }[]>(key, (list) => list?.filter((item) => item.id !== id));
}
