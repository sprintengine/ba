import { holdEarlyError } from "./early-errors";

/**
 * Browser error tracking (Sentry). `next.config.ts` injects this module ahead of hydration
 * (`instrumentationClientInject`) only in builds with `NEXT_PUBLIC_SENTRY_DSN`; without one the browser gets nothing.
 *
 * The SDK itself loads once the page is idle, keeping it out of every page's first load. Errors thrown before then are
 * held (a few) and reported when it starts.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const onError = (event: ErrorEvent) => holdEarlyError(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => holdEarlyError(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const load = () => {
    import("./sentry-client").then(
      ({ startSentry }) => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        startSentry();
      },
      // Offline or blocked: the page works the same without error tracking.
      () => undefined,
    );
  };
  // Safari has no requestIdleCallback.
  const idleApi = window as Partial<Pick<Window, "requestIdleCallback">>;
  if (idleApi.requestIdleCallback) idleApi.requestIdleCallback(load, { timeout: 4000 });
  else window.setTimeout(load, 2000);
}
