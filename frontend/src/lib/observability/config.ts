/**
 * Error tracking (Sentry) settings. Off unless a DSN is set: with none, `readSentryConfig` is null, the SDK is never
 * loaded and nothing is sent. No imports: `next.config.ts` and the Cloudflare Worker entry load this module without
 * the `@/` alias.
 */
export type SentryConfig = {
  dsn: string;
  /** `development`, `staging` or `production`. */
  environment: string;
  /** The build's version (the release train's); unset leaves it to the build (`withSentryConfig`) or the Worker. */
  release?: string;
  /** Share of requests and page loads traced, 0 to 1. 0 (the default) sends errors only. */
  tracesSampleRate: number;
};

type Env = Record<string, unknown>;

function read(env: Env, prefixes: readonly string[], name: string): string | undefined {
  for (const prefix of prefixes) {
    const value = env[`${prefix}${name}`];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function sampleRate(value: string | undefined): number {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0;
}

function readConfig(env: Env, prefixes: readonly string[], defaultEnvironment: string): SentryConfig | null {
  const dsn = read(env, prefixes, "DSN");
  if (!dsn) return null;
  const release = read(env, prefixes, "RELEASE");
  return {
    dsn,
    environment: read(env, prefixes, "ENVIRONMENT") ?? defaultEnvironment,
    ...(release ? { release } : {}),
    tracesSampleRate: sampleRate(read(env, prefixes, "TRACES_SAMPLE_RATE")),
  };
}

/**
 * The build's settings, from `NEXT_PUBLIC_SENTRY_*` only. The unprefixed `SENTRY_*` names are left alone here: a
 * build machine may hold another service's server-side DSN under them, which must not end up in the browser bundle.
 */
export function readSentryConfig(env: Env): SentryConfig | null {
  return readConfig(
    env,
    ["NEXT_PUBLIC_SENTRY_"],
    env.NODE_ENV === "production" ? "production" : "development",
  );
}

/**
 * A Cloudflare Worker's settings, from its variables: `SENTRY_*` (the names the Worker SDK itself reads), else
 * `NEXT_PUBLIC_SENTRY_*`. Workers have no NODE_ENV, and only deployed builds run there, so the environment defaults to
 * production.
 */
export function readWorkerSentryConfig(env: Env): SentryConfig | null {
  return readConfig(env, ["SENTRY_", "NEXT_PUBLIC_SENTRY_"], "production");
}

/**
 * This build's settings. Each variable is spelled out because Next inlines `process.env.NEXT_PUBLIC_*` only where it
 * is written literally.
 */
export const SENTRY_CONFIG = readSentryConfig({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  NODE_ENV: process.env.NODE_ENV,
});
