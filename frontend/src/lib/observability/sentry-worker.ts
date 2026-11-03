import { type CloudflareOptions, withSentry } from "@sentry/nextjs/cloudflare";
import { readWorkerSentryConfig } from "./config";
import { sentryOptions } from "./sentry-options";

/**
 * Error tracking for the Cloudflare Worker (`worker.ts`, the wrangler entry). On Workers `Sentry.init` in
 * `instrumentation.ts` creates no client: `withSentry` around OpenNext's handler does, per request.
 *
 * Whether it is on is the build's decision: only a build with `NEXT_PUBLIC_SENTRY_DSN` keeps the server's
 * `onRequestError` reporting (`next.config.ts` compiles it out otherwise), so a DSN that only the Worker has would add
 * the SDK's per-request work and report nothing. The build's settings reach the Worker through its env files, which
 * OpenNext compiles in (the release train writes the build's `NEXT_PUBLIC_SENTRY_*` there). The Worker's own variables
 * (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`, or the `NEXT_PUBLIC_` names) then
 * override them field by field. README "Error tracking (Sentry)".
 */

type Env = Record<string, unknown>;

const FIELDS = ["DSN", "ENVIRONMENT", "RELEASE", "TRACES_SAMPLE_RATE"] as const;

const asEnv = (env: unknown): Env => (typeof env === "object" && env !== null ? (env as Env) : {});

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * The Sentry settings as `NEXT_PUBLIC_SENTRY_*`: each from the Worker's `SENTRY_*`, else its `NEXT_PUBLIC_SENTRY_*`,
 * else the build's. Only those keys are taken from the env files, so nothing else in them (a developer's `SENTRY_DSN`
 * for another service, say) configures the Worker.
 */
function workerSettings(env: unknown, buildEnv: unknown): Env {
  const runtime = asEnv(env);
  const build = asEnv(buildEnv);
  return Object.fromEntries(
    FIELDS.map((field) => [
      `NEXT_PUBLIC_SENTRY_${field}`,
      nonEmpty(runtime[`SENTRY_${field}`]) ??
        nonEmpty(runtime[`NEXT_PUBLIC_SENTRY_${field}`]) ??
        nonEmpty(build[`NEXT_PUBLIC_SENTRY_${field}`]),
    ]),
  );
}

/** Options for `withSentry`, from the build's settings and the Worker's variables (which win). */
export function sentryWorkerOptions(env: unknown, buildEnv: unknown = {}): CloudflareOptions {
  const config = readWorkerSentryConfig(workerSettings(env, buildEnv));
  return config ? sentryOptions(config) : { enabled: false };
}

/**
 * The Worker's handler: OpenNext's, served through `withSentry` only when the build has a DSN. Without one the Worker is
 * OpenNext's own, with no SDK work per request and no change to its async context.
 */
export function sentryWorkerEntry<H extends object>(handler: H, buildEnv: unknown): H {
  if (!nonEmpty(asEnv(buildEnv).NEXT_PUBLIC_SENTRY_DSN)) return handler;
  return withSentry((requestEnv: unknown) => sentryWorkerOptions(requestEnv, buildEnv), handler as never);
}
