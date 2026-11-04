import { captureException, init } from "@sentry/nextjs";
import { SENTRY_CONFIG } from "./config";
import { takeEarlyErrors } from "./early-errors";
import { sentryOptions } from "./sentry-options";

/**
 * The browser SDK. `sentry-loader.ts` imports this module once the page is idle, and `app/error.tsx` when it catches
 * an error first; both only in builds with a DSN, so without one it is not even emitted. Tracing is compiled out of
 * the SDK unless the build has a trace rate (`next.config.ts`).
 */

let started = false;
const reported = new WeakSet<object>();

/** Starts the SDK (once) and reports the errors the page threw before it loaded. */
export function startSentry(): void {
  if (started || !SENTRY_CONFIG) return;
  started = true;
  init(sentryOptions(SENTRY_CONFIG));
  for (const error of takeEarlyErrors()) {
    captureException(error, { mechanism: { type: "auto.browser.early_error", handled: false } });
  }
}

/**
 * An error a route's error boundary (`app/error.tsx`) caught, which React does not rethrow. Each error is reported
 * once: Strict Mode runs the boundary's effect twice in development.
 */
export function captureBoundaryError(error: Error): void {
  if (!SENTRY_CONFIG || reported.has(error)) return;
  reported.add(error);
  startSentry();
  captureException(error, { mechanism: { type: "auto.function.nextjs.error_boundary", handled: false } });
}
