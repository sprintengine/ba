import type { BrowserOptions } from "@sentry/nextjs";
import type { SentryConfig } from "./config";
import { scrubBreadcrumb, scrubEvent, scrubSpan } from "./scrub";

/** The options every runtime sets, typed against the SDK so a renamed or removed option fails the type check. */
export type SharedSentryOptions = Pick<
  BrowserOptions,
  | "dsn"
  | "environment"
  | "release"
  | "tracesSampleRate"
  | "dataCollection"
  | "beforeSend"
  | "beforeSendSpan"
  | "beforeBreadcrumb"
>;

/**
 * What the SDK may collect by itself: nothing personal. Its defaults collect user info (IP inference), cookies,
 * headers, request and response bodies, query strings and local variables; only the user agent is kept, for the
 * browser and OS of a report.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies BrowserOptions["dataCollection"];

/** The options the browser, Node.js and a Cloudflare Worker start the SDK with. */
export function sentryOptions(config: SentryConfig): SharedSentryOptions {
  return {
    dsn: config.dsn,
    environment: config.environment,
    // Left out rather than undefined: the Worker SDK would otherwise drop its own fallback (the Worker's version id).
    ...(config.release ? { release: config.release } : {}),
    ...(config.tracesSampleRate > 0 ? { tracesSampleRate: config.tracesSampleRate } : {}),
    dataCollection: DATA_COLLECTION,
    // The SDK's own collection is off; these strip what reaches it anyway (messages, URLs, breadcrumbs, span names).
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
