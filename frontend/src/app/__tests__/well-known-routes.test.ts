import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";
import { config } from "../../proxy";
import * as aasa from "../.well-known/apple-app-site-association/route";
import * as assetlinks from "../.well-known/assetlinks.json/route";

afterEach(() => vi.unstubAllEnvs());

const FINGERPRINT = Array.from({ length: 32 }, () => "5A").join(":");

describe("/.well-known/apple-app-site-association", () => {
  it("serves the configured app IDs as JSON", async () => {
    vi.stubEnv("APPLE_APP_IDS", "V266333BR2.ie.bookanything.app.preview");
    const response = aasa.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const body = await response.json();
    expect(body.applinks.details[0].appIDs).toEqual(["V266333BR2.ie.bookanything.app.preview"]);
    expect(body.webcredentials.apps).toEqual(["V266333BR2.ie.bookanything.app.preview"]);
  });

  it("is not found while unconfigured", () => {
    vi.stubEnv("APPLE_APP_IDS", "");
    expect(aasa.GET().status).toBe(404);
  });
});

describe("/.well-known/assetlinks.json", () => {
  it("serves the configured package and fingerprints as JSON", async () => {
    vi.stubEnv("ANDROID_PACKAGE_NAME", "ie.bookanything.app");
    vi.stubEnv("ANDROID_SHA256_FINGERPRINTS", FINGERPRINT.toLowerCase());
    const response = assetlinks.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const [link] = await response.json();
    expect(link.target).toEqual({
      namespace: "android_app",
      package_name: "ie.bookanything.app",
      sha256_cert_fingerprints: [FINGERPRINT],
    });
  });

  it("is not found while unconfigured", () => {
    vi.stubEnv("ANDROID_PACKAGE_NAME", "ie.bookanything.app");
    vi.stubEnv("ANDROID_SHA256_FINGERPRINTS", "");
    expect(assetlinks.GET().status).toBe(404);
  });
});

describe("app link documents", () => {
  const PATHS = ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"];

  it("are read at request time, so a deploy's environment applies without a rebuild", () => {
    expect(aasa.dynamic).toBe("force-dynamic");
    expect(assetlinks.dynamic).toBe("force-dynamic");
  });

  it("skip the proxy (Clerk) and aren't rewritten to the backend", async () => {
    for (const url of PATHS)
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(false);
    const rewrites = await nextConfig.rewrites!();
    const sources = (Array.isArray(rewrites) ? rewrites : Object.values(rewrites).flat()).map(
      (r) => r.source,
    );
    expect(sources.filter((source) => PATHS.includes(source) || source === "/.well-known/:path*")).toEqual(
      [],
    );
  });
});
