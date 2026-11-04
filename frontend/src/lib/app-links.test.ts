import { describe, expect, it } from "vitest";
import { APP_LINK_PATHS, appLinksResponse, appleAppSiteAssociation, assetLinks } from "./app-links";

const PROD = "V266333BR2.ie.bookanything.app";
const PREVIEW = "V266333BR2.ie.bookanything.app.preview";
const UPLOAD = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
const PLAY = Array.from({ length: 32 }, () => "AB").join(":");

describe("appleAppSiteAssociation", () => {
  it("claims the app's paths (and everything under them) for every app ID, and shares web credentials", () => {
    expect(appleAppSiteAssociation(`${PROD}, ${PREVIEW}`)).toEqual({
      applinks: {
        details: [
          {
            appIDs: [PROD, PREVIEW],
            components: [
              { "/": "/my" },
              { "/": "/my/*" },
              { "/": "/dashboard" },
              { "/": "/dashboard/*" },
              { "/": "/manage/*" },
              { "/": "/invitations/*" },
              { "/": "/explore" },
              { "/": "/explore/*" },
              { "/": "/*/book" },
            ],
          },
        ],
      },
      webcredentials: { apps: [PROD, PREVIEW] },
    });
  });

  it("covers every path the app claims (mobile/app.config.ts)", () => {
    const claimed = appleAppSiteAssociation(PROD)!.applinks.details[0]!.components.map((c) => c["/"]);
    for (const path of APP_LINK_PATHS) expect(claimed, path).toContain(`${path}/*`);
  });

  it("drops invalid and duplicate IDs, keeping the valid ones", () => {
    const doc = appleAppSiteAssociation(`ie.bookanything.app, ${PROD},,v266333br2.x.y, ${PROD}, ABC.ie.app`);
    expect(doc?.applinks.details[0]?.appIDs).toEqual([PROD]);
    expect(doc?.webcredentials.apps).toEqual([PROD]);
  });

  it("is null when unset, empty or all invalid", () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull();
    expect(appleAppSiteAssociation(" , ")).toBeNull();
    expect(appleAppSiteAssociation("ie.bookanything.app")).toBeNull();
  });
});

describe("assetLinks", () => {
  it("delegates link handling and sign-in to the package signed with the given certificates", () => {
    expect(assetLinks("ie.bookanything.app", `${UPLOAD},${PLAY}`)).toEqual([
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: "ie.bookanything.app",
          sha256_cert_fingerprints: [UPLOAD, PLAY],
        },
      },
    ]);
  });

  it("uppercases fingerprints and drops malformed and duplicate ones", () => {
    const links = assetLinks(" ie.bookanything.app ", `${PLAY.toLowerCase()}, AB:CD, ${PLAY}, ${UPLOAD}:00`);
    expect(links?.[0]?.target).toMatchObject({
      package_name: "ie.bookanything.app",
      sha256_cert_fingerprints: [PLAY],
    });
  });

  it("is null without a valid package name or any valid fingerprint", () => {
    expect(assetLinks(undefined, PLAY)).toBeNull();
    expect(assetLinks("bookanything", PLAY)).toBeNull();
    expect(assetLinks("ie.bookanything.app", undefined)).toBeNull();
    expect(assetLinks("ie.bookanything.app", "AB:CD")).toBeNull();
  });
});

describe("appLinksResponse", () => {
  it("serves a document as JSON, cached for an hour", async () => {
    const response = appLinksResponse(assetLinks("ie.bookanything.app", PLAY));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(await response.json()).toEqual(assetLinks("ie.bookanything.app", PLAY));
  });

  it("answers 404 without one", () => {
    expect(appLinksResponse(null).status).toBe(404);
  });
});
