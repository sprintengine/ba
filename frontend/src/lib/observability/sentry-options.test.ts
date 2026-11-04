import { describe, expect, it } from "vitest";
import { TEST_SENTRY_DSN as DSN } from "@/test/sentry";
import { scrubBreadcrumb, scrubEvent, scrubSpan } from "./scrub";
import { DATA_COLLECTION, sentryOptions } from "./sentry-options";

describe("sentryOptions", () => {
  it("collects no personal data and scrubs every event, span and breadcrumb", () => {
    expect(sentryOptions({ dsn: DSN, environment: "production", tracesSampleRate: 0 })).toEqual({
      dsn: DSN,
      environment: "production",
      dataCollection: DATA_COLLECTION,
      beforeSend: scrubEvent,
      beforeSendSpan: scrubSpan,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });

  it("turns off every kind of collection the SDK defaults to, keeping only the user agent", () => {
    expect(DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
    });
  });

  it("passes the release and a trace rate only when set", () => {
    const options = sentryOptions({
      dsn: DSN,
      environment: "staging",
      release: "0123abc",
      tracesSampleRate: 0.2,
    });
    expect(options).toMatchObject({ release: "0123abc", tracesSampleRate: 0.2 });
    expect(sentryOptions({ dsn: DSN, environment: "staging", tracesSampleRate: 0 })).not.toHaveProperty(
      "release",
    );
  });
});
