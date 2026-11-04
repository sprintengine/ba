/**
 * A tiny stateful stand-in for `next/navigation`: `router.replace` updates the URL and re-renders every
 * component reading `usePathname` / `useSearchParams`. Use it with
 *   vi.mock("next/navigation", async () => (await import("./navigation-mock")).nextNavigation);
 */
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

let href = "http://localhost/explore";
const listeners = new Set<() => void>();
const paramsCache = new Map<string, URLSearchParams>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => href;

export const navigation = {
  replace: vi.fn((next: string) => {
    href = new URL(next, "http://localhost").href;
    listeners.forEach((l) => l());
  }),
  reset(path = "/explore") {
    href = new URL(path, "http://localhost").href;
    navigation.replace.mockClear();
  },
  get url() {
    return new URL(href);
  },
};

function useHref() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const nextNavigation = {
  useRouter: () => ({
    replace: navigation.replace,
    push: navigation.replace,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => new URL(useHref()).pathname,
  useSearchParams: () => {
    const current = useHref();
    let params = paramsCache.get(current);
    if (!params) {
      params = new URL(current).searchParams;
      paramsCache.set(current, params);
    }
    return params;
  },
  notFound: () => {
    throw new Error("notFound");
  },
};
