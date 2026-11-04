/**
 * Logging and error reporting (docs/mobile.md "Errors"). Features call `logError` for anything unexpected; error
 * boundaries do too. In development it goes to the console; a crash reporter (Sentry, Bugsnag…) plugs in with
 * `setErrorReporter` at start-up without features changing. No reporter is configured yet (no DSN in the repo).
 */
import { isApiError } from "@shared/api/client";

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export type ErrorReporter = {
  captureException: (error: unknown, context?: ErrorContext) => void;
  /** Who is signed in (our user id, never an email), or null when signed out. */
  setUser: (userId: string | null) => void;
};

let reporter: ErrorReporter | null = null;

export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

/** Expected failures (offline, signed out, a 404 or a validation error) are states, not bugs: don't report them. */
export function isReportable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.status >= 500 && !error.isUnavailable;
}

export function logError(error: unknown, context?: ErrorContext) {
  if (__DEV__) console.error("[bookanything]", error, context ?? "");
  if (reporter && isReportable(error)) reporter.captureException(error, context);
}

export function setReportedUser(userId: string | null) {
  reporter?.setUser(userId);
}
