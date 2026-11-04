/**
 * Errors the page threw before the Sentry SDK started, held for it. One queue on `globalThis`, so the loader that
 * fills it and whichever caller starts the SDK first (the loader once idle, or the error boundary) drain the same one.
 */
type EarlyErrors = { errors: unknown[]; started: boolean };

const KEY = Symbol.for("bookanything.sentry.earlyErrors");
const MAX_HELD = 10;

function queue(): EarlyErrors {
  const store = globalThis as unknown as Record<symbol, EarlyErrors | undefined>;
  return (store[KEY] ??= { errors: [], started: false });
}

/** Holds an error until the SDK starts (a few at most); once it has, its own handlers report them. */
export function holdEarlyError(error: unknown): void {
  const { errors, started } = queue();
  if (!started && errors.length < MAX_HELD) errors.push(error);
}

/** The held errors, once: the SDK has started and stops anything more being held. */
export function takeEarlyErrors(): unknown[] {
  const held = queue();
  held.started = true;
  return held.errors.splice(0);
}
