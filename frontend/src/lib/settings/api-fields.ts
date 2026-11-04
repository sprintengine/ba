/**
 * Server field errors are keyed by the request's field paths (`address.city`, `policies.holdMinutes`,
 * `branding.logoUrl`, `options[2]`), which aren't always the form's field names (`city`, `holdMinutes`, `logoUrl`,
 * `optionsText`). `applyApiErrors` only places errors for fields it knows and shows the generic message at the top of
 * the form for the rest, so a form whose names differ renames the keys first.
 */
import { ApiError, isApiError } from "@/lib/api/client";

/** [error] with each field key passed through [rename]; anything that isn't an API error is returned as is. */
export function renameFieldErrors(error: unknown, rename: (key: string) => string): unknown {
  if (!isApiError(error)) return error;
  const fields = Object.fromEntries(
    Object.entries(error.fields).map(([key, message]) => [rename(key), message]),
  );
  return new ApiError(error.status, error.code, error.message, fields);
}

/** [error] with the given path prefixes (`address` for `address.city`) removed from its field keys. */
export function flattenFieldErrors(error: unknown, prefixes: readonly string[]): unknown {
  return renameFieldErrors(error, (key) => {
    const prefix = prefixes.find((p) => key.startsWith(`${p}.`));
    return prefix ? key.slice(prefix.length + 1) : key;
  });
}
