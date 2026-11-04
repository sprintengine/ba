import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubSpan, scrubText, scrubValue, type ScrubbableEvent } from "./scrub";

describe("scrubText", () => {
  it("redacts manage and invitation tokens in pages, API paths and full URLs", () => {
    expect(scrubText("/manage/abc123XYZ")).toBe("/manage/[redacted]");
    expect(scrubText("/manage/abc123/pay?tab=x")).toBe("/manage/[redacted]/pay?tab=x");
    expect(scrubText("https://bookanything.example/invitations/tok_9")).toBe(
      "https://bookanything.example/invitations/[redacted]",
    );
    expect(scrubText("POST /api/v1/public/manage/s3cr3t/cancel failed: 409")).toBe(
      "POST /api/v1/public/manage/[redacted]/cancel failed: 409",
    );
    expect(scrubText("/api/v1/invitations/s3cr3t/accept")).toBe("/api/v1/invitations/[redacted]/accept");
  });

  it("keeps route patterns, which are not secrets", () => {
    expect(scrubText("GET /manage/[token]")).toBe("GET /manage/[token]");
    expect(scrubText("/invitations/[token]")).toBe("/invitations/[token]");
  });

  it("redacts URL-encoded tokens outside a query too", () => {
    expect(scrubText("no route for %2Finvitations%2Fs3cr3t%3Ffrom")).toBe(
      "no route for %2Finvitations%2F[redacted]%3Ffrom",
    );
  });

  it("drops query and fragment values except UI state, raw or URL-encoded", () => {
    // A dashboard search puts the customer's name in the URL.
    expect(scrubText("/dashboard/lumen/bookings?tab=upcoming&q=Ann+Lee&from=2026-11-03")).toBe(
      "/dashboard/lumen/bookings?tab=upcoming&q=[redacted]&from=2026-11-03",
    );
    expect(
      scrubText(
        "/oauth/authorize?client_id=app&state=xyz&code_challenge=abc&code_challenge_method=S256&scope=read",
      ),
    ).toBe(
      "/oauth/authorize?client_id=app&state=[redacted]&code_challenge=[redacted]&code_challenge_method=S256&scope=read",
    );
    expect(scrubText("/x?token=t1&TICKET=t2&Tab=day#access_token=t3")).toBe(
      "/x?token=[redacted]&TICKET=[redacted]&Tab=day#access_token=[redacted]",
    );
    expect(scrubText("/?__clerk_db_jwt=dvb_1&__session=s&session_id=cs_1&_rsc=1a2b")).toBe(
      "/?__clerk_db_jwt=[redacted]&__session=[redacted]&session_id=[redacted]&_rsc=1a2b",
    );
    // A sign-in redirect can carry a whole secret link: its value goes.
    expect(scrubText("/sign-in?redirect_url=%2Finvitations%2Fs3cr3t%3Ffrom%3Dmail&view=week")).toBe(
      "/sign-in?redirect_url=[redacted]&view=week",
    );
    expect(scrubText("next %3Fstate%3Dxyz%26scope%3Dread")).toBe("next %3Fstate%3D[redacted]%26scope%3Dread");
    // Empty values and text without a query are left as they are.
    expect(scrubText("/explore?q=&tab=")).toBe("/explore?q=&tab=");
    expect(scrubText("a == b, x = y?")).toBe("a == b, x = y?");
  });

  it("redacts auth header values and JWTs", () => {
    expect(scrubText("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer [redacted]");
    expect(scrubText("Basic dXNlcjpwYXNz==")).toBe("Basic [redacted]");
    expect(scrubText("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig_part-1 expired")).toBe(
      "token [redacted] expired",
    );
  });

  it("leaves words after an auth scheme's name alone", () => {
    for (const text of ["Basic plan", "Upgrade from basic subscription", "Bearer authentication failed"])
      expect(scrubText(text), text).toBe(text);
  });

  it("replaces email addresses, raw and encoded", () => {
    expect(scrubText("No customer with email Ann.Lee+x@mail.example")).toBe("No customer with email [email]");
    expect(scrubText("/my?email=ann%40example.com")).toBe("/my?email=[redacted]");
    expect(scrubText("search ann%40example.com")).toBe("search [email]");
  });

  it("replaces phone numbers in the usual formats", () => {
    for (const phone of ["+353 87 123 4567", "087 123 4567", "0871234567", "(01) 234-5678", "+35312345678"])
      expect(scrubText(`call ${phone} now`), phone).toBe("call [phone] now");
  });

  it("keeps numbers that are not phone numbers", () => {
    for (const text of [
      "status 409",
      "on 2026-11-03 at 10:00",
      "2026-11-03 10:00",
      "2026-11-03 10:00:00",
      "2026-11-03T10:00:00Z",
      "id 123e4567-e89b-12d3-a456-426614174000",
      "chunk 1xghgna0ak08-.js:2:1234",
      "€1,250.00",
      "v1.2.3",
    ])
      expect(scrubText(text), text).toBe(text);
  });
});

describe("scrubValue", () => {
  it("scrubs nested strings, keeps other values and cuts off deep nesting", () => {
    expect(scrubValue({ a: ["x@example.org", 1, null, true], b: { c: "/manage/t" } })).toEqual({
      a: ["[email]", 1, null, true],
      b: { c: "/manage/[redacted]" },
    });
    expect(scrubValue({ a: { b: { c: { d: { e: "deep" } } } } })).toEqual({
      a: { b: { c: { d: "[redacted]" } } },
    });
  });
});

describe("scrubEvent", () => {
  it("scrubs messages, exceptions, frames, transaction, contexts, extra and tags", () => {
    const event: ScrubbableEvent = {
      message: "Failed for ann@example.com",
      logentry: { message: "Booking for %s", params: ["ann@example.com"] },
      transaction: "/manage/s3cr3t",
      exception: {
        values: [
          {
            value: "Token /invitations/abc is invalid",
            stacktrace: {
              frames: [
                { filename: "https://x.example/manage/s3cr3t", abs_path: "https://x.example/manage/s3cr3t" },
                { filename: "app:///_next/static/chunks/a.js" },
              ],
            },
          },
          {},
        ],
      },
      contexts: { nextjs: { request_path: "/manage/s3cr3t", router_path: "/manage/[token]" } },
      extra: { phone: "+353 87 123 4567" },
      tags: { url: "/invitations/abc", count: 3 },
    };
    expect(scrubEvent(event)).toEqual({
      message: "Failed for [email]",
      logentry: { message: "Booking for %s" },
      transaction: "/manage/[redacted]",
      exception: {
        values: [
          {
            value: "Token /invitations/[redacted] is invalid",
            stacktrace: {
              frames: [
                {
                  filename: "https://x.example/manage/[redacted]",
                  abs_path: "https://x.example/manage/[redacted]",
                },
                { filename: "app:///_next/static/chunks/a.js" },
              ],
            },
          },
          {},
        ],
      },
      contexts: { nextjs: { request_path: "/manage/[redacted]", router_path: "/manage/[token]" } },
      extra: { phone: "[phone]" },
      tags: { url: "/invitations/[redacted]", count: 3 },
    });
  });

  it("keeps only the request's scrubbed URL, method and user agent", () => {
    const request = {
      url: "https://x.example/manage/s3cr3t?token=t&tab=day",
      method: "GET",
      headers: {
        Cookie: "__session=s",
        Referer: "https://x.example/manage/s3cr3t",
        "user-agent": "Mozilla/5.0",
      },
      cookies: { __session: "s" },
      data: { email: "ann@example.com" },
      query_string: "token=t",
    };
    expect(scrubEvent({ request }).request).toEqual({
      url: "https://x.example/manage/[redacted]?token=[redacted]&tab=day",
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    expect(scrubEvent({ request: { cookies: "a=b" } as ScrubbableEvent["request"] }).request).toEqual({});
  });

  it("keeps at most an opaque user id", () => {
    const user = { id: "u_1", email: "ann@example.com", ip_address: "192.0.2.1", username: "ann" };
    expect(scrubEvent({ user }).user).toEqual({ id: "u_1" });
    expect(scrubEvent({ user: { email: "ann@example.com" } as ScrubbableEvent["user"] })).toEqual({});
  });

  it("scrubs breadcrumbs and leaves an event without personal data as it was", () => {
    expect(
      scrubEvent({ breadcrumbs: [{ category: "navigation", data: { from: "/", to: "/manage/t" } }] })
        .breadcrumbs,
    ).toEqual([{ category: "navigation", data: { from: "/", to: "/manage/[redacted]" } }]);
    expect(scrubEvent({ message: "Boom", transaction: "/explore" })).toEqual({
      message: "Boom",
      transaction: "/explore",
    });
    expect(scrubEvent({ logentry: {} }).logentry).toEqual({ message: "" });
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs fetch URLs and messages", () => {
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { method: "POST", url: "/api/v1/public/manage/s3cr3t/pay", status_code: 200 },
      }),
    ).toEqual({
      category: "fetch",
      data: { method: "POST", url: "/api/v1/public/manage/[redacted]/pay", status_code: 200 },
    });
    expect(
      scrubBreadcrumb({ category: "ui.click", message: 'button[aria-label="Email ann@example.net"]' }),
    ).toEqual({ category: "ui.click", message: 'button[aria-label="Email [email]"]' });
  });

  it("drops console arguments, keeping the scrubbed message", () => {
    expect(
      scrubBreadcrumb({
        category: "console",
        message: "saving ann@example.com",
        data: { arguments: [{ customer: { email: "ann@example.com" } }], logger: "console" },
      }),
    ).toEqual({ category: "console", message: "saving [email]", data: { logger: "console" } });
  });

  it("returns a breadcrumb without text as it was", () => {
    expect(scrubBreadcrumb({ category: "sentry.event" })).toEqual({ category: "sentry.event" });
  });
});

describe("scrubSpan", () => {
  it("scrubs the span name and attribute values", () => {
    const span = {
      span_id: "1",
      name: "/manage/s3cr3t",
      attributes: {
        "url.full": "https://x.example/api/v1/public/manage/s3cr3t?q=Ann",
        "http.query": { value: "?q=Ann&tab=day", type: "string" },
        "http.response.status_code": 200,
      },
    };
    expect(scrubSpan(span)).toEqual({
      span_id: "1",
      name: "/manage/[redacted]",
      attributes: {
        "url.full": "https://x.example/api/v1/public/manage/[redacted]?q=[redacted]",
        "http.query": { value: "?q=[redacted]&tab=day", type: "string" },
        "http.response.status_code": 200,
      },
    });
  });

  it("keeps a span without attributes as it is", () => {
    expect(scrubSpan({ name: "GET /manage/[token]" })).toEqual({ name: "GET /manage/[token]" });
  });
});
