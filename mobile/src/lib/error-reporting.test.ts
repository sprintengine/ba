import * as Sentry from "@sentry/react-native";
import type { ErrorEvent } from "@sentry/react-native";
import { ApiError } from "@shared/api/client";
import {
  reportedUserId,
  resetErrorReportingForTests,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  sentryOptions,
  startErrorReporting,
} from "./error-reporting";
import { logError, setReportedUser } from "./logger";

const DSN = "https://publickey@sentry.example/0";
const sentry = jest.mocked(Sentry);

describe("error reporting", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    sentry.init.mockClear();
    sentry.captureException.mockClear();
    sentry.setUser.mockClear();
  });
  afterEach(() => resetErrorReportingForTests());

  it("stays off without a DSN: no SDK, no reporter", () => {
    expect(startErrorReporting({ sentryDsn: null, sentryEnvironment: "development" })).toBe(false);
    logError(new Error("boom"));
    setReportedUser("user_1");
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
  });

  it("starts Sentry with a DSN and reports through the logger", () => {
    expect(startErrorReporting({ sentryDsn: DSN, sentryEnvironment: "staging" })).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN, environment: "staging" }));

    const error = new Error("boom");
    logError(error, { screen: "bookings" });
    logError(new ApiError(404, "NOT_FOUND", "gone"));
    logError(new Error("no context"));
    expect(sentry.captureException.mock.calls).toEqual([
      [error, { contexts: { details: { screen: "bookings" } } }],
      [expect.any(Error), undefined],
    ]);

    setReportedUser("user_1");
    setReportedUser(null);
    expect(sentry.setUser.mock.calls).toEqual([[{ id: "user_1" }], [null]]);
  });

  it("starts once, however often the root layout's module runs (Fast Refresh)", () => {
    const config = { sentryDsn: DSN, sentryEnvironment: "development" };
    expect(startErrorReporting(config)).toBe(true);
    expect(startErrorReporting(config)).toBe(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  it("names the person by Clerk's opaque id only, never dev sign-in's (made from an email)", () => {
    const user = { id: "user_2abc", email: "ana@example.com", name: null, imageUrl: null };
    expect(reportedUserId({ mode: "clerk", user })).toBe("user_2abc");
    expect(reportedUserId({ mode: "clerk", user: null })).toBeNull();
    expect(reportedUserId({ mode: "dev", user: { ...user, id: "dev_ana" } })).toBeNull();
  });

  it("sends errors only: no personal data, replay, tracing or request details", () => {
    const options = sentryOptions(DSN, "production");
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
      enableNetworkBreadcrumbs: false,
      tracePropagationTargets: [],
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    // Present at all (even 0), these install tracing, profiling or replay.
    for (const key of [
      "tracesSampleRate",
      "tracesSampler",
      "profilesSampleRate",
      "replaysSessionSampleRate",
      "replaysOnErrorSampleRate",
      "integrations",
    ]) {
      expect(options).not.toHaveProperty(key);
    }
  });
});

describe("scrubbing", () => {
  it("removes emails, phone numbers and secret tokens from text", () => {
    expect(
      scrubText("No account for ana.ryan+test@example.com, call +353 87 123 4567 or (01) 234-5678."),
    ).toBe("No account for [email], call [phone] or [phone].");
    expect(scrubText("GET https://api.test/v1/public/manage/abc123XYZ/cancel?x=1")).toBe(
      "GET https://api.test/v1/public/manage/[token]/cancel?[query]",
    );
    expect(scrubText("bookanything://invitations/inv_9f8e7d and /manage/tok")).toBe(
      "bookanything://invitations/[token] and /manage/[token]",
    );
    expect(scrubText("/sign-in?token=s3cret&next=/my&access_token=abc#id_token=x")).toBe(
      "/sign-in?token=[redacted]&next=/my&access_token=[redacted]#id_token=[redacted]",
    );
    expect(scrubText("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer [redacted]");
    expect(scrubText("jwt eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl")).toBe("jwt [jwt]");
  });

  it("removes the number from a phone or text link that failed to open", () => {
    expect(scrubText("Unable to open URL: tel:+353871234567")).toBe("Unable to open URL: tel:[phone]");
    expect(scrubText("Could not open sms:0871234567 or telprompt:+353871234567")).toBe(
      "Could not open sms:[phone] or telprompt:[phone]",
    );
  });

  it("finds emails and numbers however they're encoded or written", () => {
    expect(scrubText("q=ana%40example.com&phone=%2B353871234567")).toBe("q=[email]&phone=[phone]");
    expect(scrubText("call 087+123+4567 or Phone:0871234567")).toBe("call [phone] or Phone:[phone]");
    expect(scrubText("100% done, 50%off")).toBe("100% done, 50%off");
  });

  it("drops an absolute URL's query and fragment, where searches and addresses go", () => {
    expect(scrubText("Unable to open URL: https://maps.apple.com/?q=1%20Main%20St%2C%20Dublin")).toBe(
      "Unable to open URL: https://maps.apple.com/?[query]",
    );
    expect(scrubText("geo:0,0?q=1%20Main%20St")).toBe("geo:0,0?[query]");
  });

  it("leaves dates, times, ids, timestamps and status codes readable", () => {
    const text =
      "Booking BA-7K3F9Q on 2026-11-03 (03/11/2026) at 10:00 failed with 500 (2026-11-03T10:00:00Z, user_2abc123) " +
      "at 1793700000000, booking 12345678";
    expect(scrubText(text)).toBe(text);
  });

  it("scrubs breadcrumbs' messages and data, however nested", () => {
    expect(
      scrubBreadcrumb({
        category: "console",
        message: "signed in as ana@example.com",
        data: { arguments: [{ url: "/invitations/abc" }, new Error("for 0871234567")], status_code: 500 },
      }),
    ).toEqual({
      category: "console",
      message: "signed in as [email]",
      data: { arguments: [{ url: "/invitations/[token]" }, "Error: for [phone]"], status_code: 500 },
    });
    expect(scrubBreadcrumb({ category: "touch" })).toEqual({ category: "touch" });
  });

  it("drops a request breadcrumb's query: customer searches go there", () => {
    for (const q of ["ana%40example.com", "Ana+Ryan", "087+123+4567"]) {
      expect(
        scrubBreadcrumb({
          category: "xhr",
          data: { url: `https://api.test/v1/businesses/lumen/customers?q=${q}#top`, status_code: 200 },
        }).data,
      ).toEqual({ url: "https://api.test/v1/businesses/lumen/customers", status_code: 200 });
    }
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "/v1/public/manage/tok?q=Ana" } }).data).toEqual(
      {
        url: "/v1/public/manage/[token]",
      },
    );
  });

  it("describes objects without a prototype instead of throwing", () => {
    const bare = Object.assign(Object.create(null) as object, { email: "ana@example.com" });
    expect(scrubBreadcrumb({ data: { arguments: [bare] } }).data).toEqual({ arguments: ["[object Object]"] });
  });

  it("scrubs events and drops the request's body, headers and query", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "for ana@example.com",
      exception: { values: [{ type: "Error", value: "manage /manage/tok1 failed" }, { type: "Error" }] },
      breadcrumbs: [{ message: "GET /v1/public/manage/tok2" }],
      request: {
        url: "https://api.test/v1/invitations/tok3/accept?email=ana@example.com",
        data: { phone: "0871234567" },
        headers: { Authorization: "Bearer x" },
        cookies: { session: "x" },
        query_string: "email=ana@example.com",
      },
      extra: { note: "call 0871234567" },
      contexts: { details: { screen: "manage", email: "ana@example.com" }, os: { name: "iOS" } },
      user: { id: "user_1", email: "ana@example.com", ip_address: "{{auto}}" },
    };
    expect(scrubEvent(event, { originalException: new Error("x") })).toEqual({
      type: undefined,
      message: "for [email]",
      exception: { values: [{ type: "Error", value: "manage /manage/[token] failed" }, { type: "Error" }] },
      breadcrumbs: [{ message: "GET /v1/public/manage/[token]" }],
      request: { url: "https://api.test/v1/invitations/[token]/accept" },
      extra: { note: "call [phone]" },
      contexts: { details: { screen: "manage", email: "[email]" }, os: { name: "iOS" } },
      user: { id: "user_1" },
    });
    expect(scrubEvent({ type: undefined, user: { email: "ana@example.com" } })).toEqual({
      type: undefined,
      user: undefined,
    });
  });

  it("drops expected API states that reach Sentry on their own (an unhandled rejection)", () => {
    const event: ErrorEvent = { type: undefined, message: "x" };
    expect(scrubEvent(event, { originalException: new ApiError(401, "UNAUTHENTICATED", "x") })).toBeNull();
    expect(
      scrubEvent(event, { originalException: new ApiError(500, "INTERNAL_SERVER_ERROR", "x") }),
    ).not.toBeNull();
  });

  it("always sends a crash, even one an expected API state caused", () => {
    const crash: ErrorEvent = { type: undefined, level: "fatal", message: "x" };
    expect(scrubEvent(crash, { originalException: new ApiError(401, "UNAUTHENTICATED", "x") })).toMatchObject(
      {
        level: "fatal",
      },
    );
  });
});
