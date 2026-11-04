/**
 * Wires the shared API client (`@shared/api/client`) to this app: the API origin directly (no `/api` rewrite on a
 * phone) and Expo's WinterCG `fetch`, whose responses stream (React Native's own fetch buffers the whole body, so
 * Bo's server-sent events would arrive all at once at the end of a turn). The auth layer registers the token getter
 * (src/auth). Called once, before anything renders.
 */
import { fetch as expoFetch } from "expo/fetch";
import { configureApiClient } from "@shared/api/client";
import { env } from "~/config/env";

/**
 * `expo/fetch` with the API's rules: bearer tokens only, never cookies (it treats `same-origin` as `include`, and a
 * phone has no origin to be the same as).
 */
export const apiFetch = ((input: string | URL, init?: RequestInit) =>
  expoFetch(input, {
    ...(init as Parameters<typeof expoFetch>[1]),
    credentials: "omit",
  })) as unknown as typeof fetch;

export function configureApi(apiUrl: string = env.apiUrl) {
  configureApiClient({ baseUrl: apiUrl, fetch: apiFetch });
}
