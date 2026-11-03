/** A placeholder Sentry DSN in the documented format; nothing listens at it. */
export const TEST_SENTRY_DSN = "https://examplePublicKey@sentry.example/0";

/** Clears the queue of errors held for the SDK (`lib/observability/early-errors.ts`), which lives on `globalThis`. */
export function resetEarlyErrors(): void {
  Reflect.deleteProperty(globalThis, Symbol.for("bookanything.sentry.earlyErrors"));
}
