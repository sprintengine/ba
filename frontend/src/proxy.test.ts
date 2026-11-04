import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { config } from "./proxy";

const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });

describe("proxy matcher", () => {
  it("runs on pages", () => {
    for (const url of ["/", "/dashboard/gleam", "/gleam/book", "/mcpherson-physio", "/oauth/authorize"])
      expect(runsOn(url), url).toBe(true);
  });

  it("skips Next internals, static files and the rewrites to the backend", () => {
    for (const url of [
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/api/v1/me",
      "/mcp",
      "/mcp/business",
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource/mcp/business",
    ])
      expect(runsOn(url), url).toBe(false);
  });
});
