import type { Instrumentation } from "next";

/**
 * Server-side error tracking (Sentry), on only in builds with `NEXT_PUBLIC_SENTRY_DSN`. The checks are on the variable
 * itself, which `next.config.ts` always defines, so a build without one drops the SDK from the server bundle too.
 *
 * Under `next start` (Node.js) `register` starts the SDK. On Cloudflare Workers it creates no client: the Worker
 * entry's `withSentry` does (`lib/observability/sentry-worker.ts`), and `onRequestError` reports through it.
 */
export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const [{ init }, { SENTRY_CONFIG }, { sentryOptions }] = await Promise.all([
      import("@sentry/nextjs"),
      import("@/lib/observability/config"),
      import("@/lib/observability/sentry-options"),
    ]);
    if (SENTRY_CONFIG) init(sentryOptions(SENTRY_CONFIG));
  }
}

/** Errors thrown while rendering server components, in route handlers and in the proxy. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { captureRequestError } = await import("@sentry/nextjs");
    captureRequestError(...args);
  }
};
