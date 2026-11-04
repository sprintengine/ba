/**
 * Crash and error reporting with Sentry (docs/mobile.md "Errors and crash reporting"). Off unless the build has a DSN
 * (`EXPO_PUBLIC_SENTRY_DSN`): then the SDK never starts, nothing is sent and `logError` only logs in development.
 * With one, Sentry catches crashes and unhandled errors itself and `logError` hands it the rest. Everything the JS
 * side sends is scrubbed here first (emails, phone numbers, booking and invitation tokens, URL queries, request
 * bodies and headers); native crash reports don't pass through JS and rely on Sentry's server-side scrubbing.
 */
import type { Breadcrumb, ErrorEvent, ReactNativeOptions } from "@sentry/react-native";
import type { AuthState } from "@shared/auth/types";
import { env, type AppEnv } from "~/config/env";
import { isReportable, setErrorReporter, type ErrorReporter } from "./logger";

type EventHint = Parameters<NonNullable<ReactNativeOptions["beforeSend"]>>[1];
type Sentry = typeof import("@sentry/react-native");

const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** `tel:`, `sms:` links (a failed `Linking.openURL` names its URL): whatever follows is a number. */
const PHONE_LINK = /\b(tel|telprompt|sms|smsto):[^\s'"]+/gi;
/** 8 to 15 digits, maybe with a leading + and spaces, dots, dashes, pluses or brackets between them. */
const PHONE = /(^|[^\w/.+-])(\+?\(?\d(?:[\s().+-]{0,2}\d){7,14})(?![\w/:-])/g;
/** Digit runs that aren't phone numbers: dates, and plain numbers (timestamps, ids) without a leading 0 or +. */
const NOT_PHONE = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|[1-9]\d*)$/;
/** An absolute URL's query and fragment (a search, an address for the maps app): dropped whole. */
const URL_QUERY = /(\b[a-z][\w+.-]*:[^\s?#'"]*)[?#][^\s'"]*/gi;
/** A guest's manage link and a staff invitation carry their secret in the path, on the website and the API. */
const PATH_TOKEN = /(\/(?:manage|invitations)\/)[^/?#\s"')]+/gi;
const QUERY_SECRET =
  /([?&#;](?:[\w-]*token|code|state|secret|password|key|signature|sig|__clerk[\w-]*)=)[^&#\s"']*/gi;
const BEARER = /\bBearer\s+[\w.~+/-]+=*/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

/** Percent-escapes one at a time, so `%40` and `%2B` become `@` and `+` even next to a stray `%`. */
function decodeEscapes(text: string): string {
  return text.replace(/%[0-9a-f]{2}/gi, (escape) => {
    try {
      return decodeURIComponent(escape);
    } catch {
      return escape;
    }
  });
}

/** Removes personal data and secrets from free text: messages, URLs, breadcrumb data. */
export function scrubText(text: string): string {
  // Queries go before decoding: an encoded address or search is one unbroken run until then.
  return decodeEscapes(text.replace(URL_QUERY, "$1?[query]"))
    .replace(PATH_TOKEN, "$1[token]")
    .replace(QUERY_SECRET, "$1[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[jwt]")
    .replace(PHONE_LINK, "$1:[phone]")
    .replace(EMAIL, "[email]")
    .replace(PHONE, (match, before: string, number: string) =>
      NOT_PHONE.test(number) ? match : `${before}[phone]`,
    );
}

/** A request's URL without its query or fragment (a search for a customer's name, email or phone). */
function scrubUrl(url: string): string {
  return scrubText(url.split(/[?#]/)[0] ?? "");
}

/** `String()` throws on objects without a prototype; those become a placeholder. */
function describe(value: object): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 5) return "[deep]";
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  // Class instances (an Error in a console breadcrumb) would serialise their own fields unscrubbed.
  if (Object.getPrototypeOf(value) !== Object.prototype) return scrubText(describe(value));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth + 1)]));
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const { message, data } = breadcrumb;
  return {
    ...breadcrumb,
    ...(message !== undefined && { message: scrubText(message) }),
    ...(data && {
      data: {
        ...(scrubValue(data) as Breadcrumb["data"]),
        // Request breadcrumbs: the API client puts searches in the query (`?q=Ana+Ryan`).
        ...(typeof data.url === "string" && { url: scrubUrl(data.url) }),
      },
    }),
  };
}

/**
 * The last step before a JS event leaves the phone. Expected API states are dropped here too, so unhandled
 * rejections follow the same rule as `logError` (`isReportable`); a crash (level fatal) is always sent.
 */
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const expected = hint?.originalException !== undefined && !isReportable(hint.originalException);
  if (expected && event.level !== "fatal") return null;
  const { request, contexts, exception } = event;
  return {
    ...event,
    ...(event.message !== undefined && { message: scrubText(event.message) }),
    ...(exception?.values && {
      exception: {
        ...exception,
        values: exception.values.map((v) =>
          v.value === undefined ? v : { ...v, value: scrubText(v.value) },
        ),
      },
    }),
    ...(event.breadcrumbs && { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }),
    // The URL only: no body, headers, cookies or query (which may hold a token or someone's details).
    ...(request && { request: { url: request.url && scrubUrl(request.url) } }),
    ...(event.extra && { extra: scrubValue(event.extra) as ErrorEvent["extra"] }),
    ...(contexts?.details && {
      contexts: { ...contexts, details: scrubValue(contexts.details) as Record<string, unknown> },
    }),
    // Our opaque user id only (setReportedUser), never an email, name or IP address.
    user: event.user?.id === undefined ? undefined : { id: event.user.id },
  };
}

/** Read by the iOS SDK, though not in the JS types. */
type NativeOnlyOptions = { enableNetworkBreadcrumbs: boolean };

export function sentryOptions(dsn: string, environment: string): ReactNativeOptions & NativeOnlyOptions {
  return {
    dsn,
    environment,
    // Release and dist are left to the SDK (`bundle id@version+build number`, build number): the build's source map
    // upload uses the same, and debug ids match the maps besides.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Failed requests are screen states (ErrorState), and their URLs and bodies are the riskiest data we have.
    enableCaptureFailedRequests: false,
    // iOS's own request breadcrumbs skip `beforeBreadcrumb` and would put token URLs on native crash reports.
    enableNetworkBreadcrumbs: false,
    // Errors only. No `tracesSampleRate`, `profilesSampleRate` or replay rates: even at 0 they install the tracing,
    // profiling and session replay machinery. No trace headers on our requests either.
    tracePropagationTargets: [],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

export function sentryReporter(sentry: Pick<Sentry, "captureException" | "setUser">): ErrorReporter {
  return {
    captureException: (error, context) =>
      void sentry.captureException(error, context ? { contexts: { details: context } } : undefined),
    setUser: (userId) => sentry.setUser(userId ? { id: userId } : null),
  };
}

let started = false;

/** At start-up: starts Sentry and plugs it into the logger when the build has a DSN. Returns whether it's on. */
export function startErrorReporting(config: Pick<AppEnv, "sentryDsn" | "sentryEnvironment"> = env): boolean {
  if (!config.sentryDsn) return false;
  // Once: Fast Refresh re-runs the root layout's module, which calls this.
  if (started) return true;
  // Loaded only when used, as Clerk is: without a DSN the SDK never runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sentry = require("@sentry/react-native") as Sentry;
  sentry.init(sentryOptions(config.sentryDsn, config.sentryEnvironment));
  setErrorReporter(sentryReporter(sentry));
  started = true;
  return true;
}

export function resetErrorReportingForTests() {
  started = false;
  setErrorReporter(null);
}

/**
 * Who errors are reported for: Clerk's opaque user id. Dev sign-in's id is made from the email address, so nobody is
 * named there.
 */
export function reportedUserId({ mode, user }: Pick<AuthState, "mode" | "user">): string | null {
  return mode === "clerk" ? (user?.id ?? null) : null;
}
