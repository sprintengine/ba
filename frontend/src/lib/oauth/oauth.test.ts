import { afterEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import { appUrl, configuredOrigin, publicHost, urlHost } from "./app-url";
import { authorizeReturnPath, parseAuthorizeQuery } from "./authorize-query";
import { formatLastUsed } from "./format";

const FULL =
  "response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Foauth%2Fmcp-oauth-client-metadata" +
  "&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc123" +
  "&code_challenge_method=S256&scope=bookings%3Aread%20bookings%3Awrite&state=xyz&resource=https%3A%2F%2Fbookanything.ie%2Fmcp";

describe("parseAuthorizeQuery", () => {
  it("maps every snake_case parameter to the request", () => {
    expect(parseAuthorizeQuery(new URLSearchParams(FULL))).toEqual({
      clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      responseType: "code",
      codeChallenge: "abc123",
      codeChallengeMethod: "S256",
      scope: "bookings:read bookings:write",
      state: "xyz",
      resource: "https://bookanything.ie/mcp",
    });
  });

  it("turns missing and empty parameters into null", () => {
    expect(parseAuthorizeQuery("?client_id=app&state=")).toEqual({
      clientId: "app",
      redirectUri: null,
      responseType: null,
      codeChallenge: null,
      codeChallengeMethod: null,
      scope: null,
      state: null,
      resource: null,
    });
  });

  it("keeps the first value of a repeated parameter and ignores unknown ones", () => {
    const request = parseAuthorizeQuery("client_id=first&client_id=second&prompt=consent");
    expect(request.clientId).toBe("first");
    expect(request).not.toHaveProperty("prompt");
  });

  it("accepts a Next searchParams record, including arrays", () => {
    const request = parseAuthorizeQuery({
      client_id: ["a", "b"],
      scope: "marketplace:read",
      state: undefined,
    });
    expect(request).toMatchObject({ clientId: "a", scope: "marketplace:read", state: null });
  });
});

describe("authorizeReturnPath", () => {
  it("rebuilds the exact consent URL with its query", () => {
    expect(authorizeReturnPath(`?${FULL}`)).toBe(`/oauth/authorize?${FULL}`);
    const rebuilt = authorizeReturnPath(new URLSearchParams(FULL));
    expect(parseAuthorizeQuery(must(rebuilt.split("?")[1], "query"))).toEqual(parseAuthorizeQuery(FULL));
    expect(authorizeReturnPath("")).toBe("/oauth/authorize");
  });
});

describe("app URL helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses NEXT_PUBLIC_APP_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie/");
    expect(configuredOrigin()).toBe("https://bookanything.ie");
    expect(appUrl("/mcp")).toBe("https://bookanything.ie/mcp");
  });

  it("falls back to the browser origin when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appUrl("/mcp")).toBe(`${window.location.origin}/mcp`);
  });

  it("shows addresses on the configured host, else on bookanything.ie", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.bookanything.ie/");
    expect(publicHost()).toBe("staging.bookanything.ie");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(publicHost()).toBe("localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicHost()).toBe("bookanything.ie");
  });

  it("extracts a display host and rejects non-URLs", () => {
    expect(urlHost("https://claude.ai/some/path")).toBe("claude.ai");
    expect(urlHost("not a url")).toBeNull();
    expect(urlHost(null)).toBeNull();
  });
});

describe("formatLastUsed", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it.each([
    [null, "Not used yet"],
    ["2026-10-01T08:00:00Z", "Last used today"],
    ["2026-09-30T08:00:00Z", "Last used yesterday"],
    ["2026-09-27T08:00:00Z", "Last used 4 days ago"],
    ["2026-08-15T08:00:00Z", "Last used on 15 Aug 2026"],
  ])("%s → %s", (iso, expected) => {
    expect(formatLastUsed(iso, "Europe/Dublin", now)).toBe(expected);
  });
});
