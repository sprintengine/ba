/**
 * `next/navigation` backed by the real `window.location`, for components that keep state in the URL with the
 * History API (the booking flow). Use in a test file:
 *
 *   vi.mock("next/navigation", async () => (await import("./navigation-mock")).locationNavigation("/lumen-physio"));
 *   beforeEach(() => trackHistory());   afterEach(() => untrackHistory());
 *
 * Kept free of app imports so the mock factory can load it before the code under test.
 */
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

/** `router.push`/`replace` calls, shared by every test in the file (reset it in `beforeEach`). */
export const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() };

const subscribe = (cb: () => void) => {
  window.addEventListener("locationchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("locationchange", cb);
    window.removeEventListener("popstate", cb);
  };
};

export function locationNavigation(pathname: string) {
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    usePathname: () => pathname,
    useRouter: () => router,
  };
}

const originalPush = window.history.pushState.bind(window.history);
const originalReplace = window.history.replaceState.bind(window.history);

/** Makes `pushState`/`replaceState` notify `useSearchParams`, and starts at `url`. */
export function trackHistory(url: string) {
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPush(...args);
    window.dispatchEvent(new Event("locationchange"));
  };
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplace(...args);
    window.dispatchEvent(new Event("locationchange"));
  };
  originalReplace(null, "", url);
  for (const fn of Object.values(router)) fn.mockReset();
}

export function untrackHistory() {
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
}

/** The current URL's search params. */
export const urlParams = () => new URLSearchParams(window.location.search);
