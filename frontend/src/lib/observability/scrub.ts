/**
 * Strips personal data and bearer secrets from error reports before they leave the app. Pure string work, so the
 * browser, the server and a Worker share it.
 *
 * Secrets: a `/manage/{token}` link manages a booking and an `/invitations/{token}` link joins a business, for whoever
 * holds it (the backend redacts the same segments from its logs). Query values are dropped unless the parameter is
 * known to hold only UI state (a search box puts customer names in `?q=`, OAuth puts `state` in the URL, a sign-in
 * `redirect_url` can carry a whole secret link). Bearer tokens and JWTs go too, and emails and phone numbers anywhere
 * in a message.
 */

const REDACTED = "[redacted]";

/** `/manage/<token>` and `/invitations/<token>`, raw or `%2F`-encoded; a route pattern such as `[token]` is kept. */
const SECRET_SEGMENT = /(\/|%2F)(manage|invitations)(\/|%2F)(?!\[)(?:(?!%2F|%3F|%26|%23)[^/?#&\s"'<>])+/gi;

/** Query parameters whose values are UI state (tabs, date ranges, ids, flow steps, public OAuth fields): kept. */
const KEPT_PARAMS = new Set([
  "_rsc",
  "after",
  "booked",
  "cancelled",
  "client_id",
  "code_challenge_method",
  "date",
  "from",
  "intent",
  "mode",
  "new",
  "page",
  "pay",
  "payment",
  "range",
  "resource",
  "response_type",
  "scope",
  "service",
  "site",
  "status",
  "tab",
  "template",
  "theme",
  "to",
  "view",
]);
/** `?name=value`, `&…` or `#…`, raw or URL-encoded (inside another parameter's value). */
const QUERY_PARAM = /([?&#]|%3F|%26|%23)([^=&#?\s"'<>%]+)(=|%3D)((?:(?!%26|%23)[^&#\s"'<>])*)/gi;

/** An auth scheme followed by a credential: 8+ token characters, at least one of them not a letter. */
const AUTH_HEADER_VALUE = /\b(Bearer|Basic)\s+(?=[\w.~+/=-]*[\d.~+/=_-])[\w.~+/-]{8,}=*/g;
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g;
const EMAIL = /[\w.+-]+(?:@|%40)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
/** 7 to 15 digits, optionally spaced, dashed or bracketed, not part of a longer word, number, time or path. */
const PHONE = /(?<![\w.+/:-])\+?\(?\d(?:[\s().-]{0,2}\d){6,14}(?![\w:-])/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function scrubQueryParam(
  match: string,
  separator: string,
  name: string,
  equals: string,
  value: string,
): string {
  return !value || KEPT_PARAMS.has(name.toLowerCase()) ? match : `${separator}${name}${equals}${REDACTED}`;
}

/** `text` with secret links, query values, auth values, emails and phone numbers replaced by placeholders. */
export function scrubText(text: string): string {
  return text
    .replace(SECRET_SEGMENT, `$1$2$3${REDACTED}`)
    .replace(QUERY_PARAM, scrubQueryParam)
    .replace(AUTH_HEADER_VALUE, `$1 ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(EMAIL, "[email]")
    .replace(PHONE, (match) => (ISO_DATE.test(match) ? match : "[phone]"));
}

/** Every string in `value` scrubbed, down to a few levels of nesting (deeper values are dropped). */
export function scrubValue(value: unknown, depth = 4): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth === 0) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth - 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth - 1)]));
}

function scrubRecord<T>(record: T): T {
  return scrubValue(record) as T;
}

/** The parts of an SDK event that can carry personal data (structural, so this module needs no SDK types). */
export type ScrubbableEvent = {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  transaction?: string;
  exception?: {
    values?: { value?: string; stacktrace?: { frames?: { filename?: string; abs_path?: string }[] } }[];
  };
  request?: { url?: string; method?: string; headers?: Record<string, string> };
  user?: { id?: string | number };
  breadcrumbs?: ScrubbableBreadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

export type ScrubbableBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

/** Only the URL (scrubbed), the method and the user agent: no cookies, other headers, body or query string. */
function scrubRequest(
  request: NonNullable<ScrubbableEvent["request"]>,
): NonNullable<ScrubbableEvent["request"]> {
  const userAgent = Object.entries(request.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "user-agent",
  )?.[1];
  return {
    ...(request.url ? { url: scrubText(request.url) } : {}),
    ...(request.method ? { method: request.method } : {}),
    ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
  };
}

function scrubExceptions(exception: ScrubbableEvent["exception"]): void {
  for (const value of exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
    // An inline script's frames are named after the page URL.
    for (const frame of value.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = scrubText(frame.filename);
      if (frame.abs_path) frame.abs_path = scrubText(frame.abs_path);
    }
  }
}

/** `beforeSend`: scrubs the error event in place and returns it. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.message) event.message = scrubText(event.message);
  // The formatted message is enough; its parameters are raw values.
  if (event.logentry) event.logentry = { message: scrubText(event.logentry.message ?? "") };
  if (event.transaction) event.transaction = scrubText(event.transaction);
  scrubExceptions(event.exception);
  if (event.request) event.request = scrubRequest(event.request);
  // At most an opaque id; the app never sets more, but integrations could.
  if (event.user?.id !== undefined) event.user = { id: event.user.id };
  else delete event.user;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.contexts) event.contexts = scrubRecord(event.contexts);
  if (event.extra) event.extra = scrubRecord(event.extra);
  if (event.tags) event.tags = scrubRecord(event.tags);
  return event;
}

/** `beforeBreadcrumb`: navigation, fetch and click breadcrumbs keep their shape with URLs and text scrubbed. */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) {
    // Console arguments can be whole objects (a booking, a customer): the scrubbed message is enough.
    const { arguments: _arguments, ...data } = breadcrumb.data;
    breadcrumb.data = scrubRecord(breadcrumb.category === "console" ? data : breadcrumb.data);
  }
  return breadcrumb;
}

export type ScrubbableSpan = { name: string; attributes?: Record<string, unknown> };

/**
 * `beforeSendSpan` (only with tracing on): a page load is named after its raw path and a fetch span carries the full
 * URL in its attributes, so both are scrubbed.
 */
export function scrubSpan<S extends ScrubbableSpan>(span: S): S {
  span.name = scrubText(span.name);
  if (span.attributes) span.attributes = scrubRecord(span.attributes);
  return span;
}
