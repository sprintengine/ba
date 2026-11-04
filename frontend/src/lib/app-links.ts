/**
 * Universal links (iOS) and App Links (Android): the documents that let the mobile app open this site's links
 * (docs/mobile.md §6). Pure builders; the route handlers under `app/.well-known/` feed them the environment:
 *
 * - `APPLE_APP_IDS`: comma-separated `TEAMID.bundle.id` (`V266333BR2.ie.bookanything.app`).
 * - `ANDROID_PACKAGE_NAME` (`ie.bookanything.app`) and `ANDROID_SHA256_FINGERPRINTS`: comma-separated SHA-256 signing
 *   certificate fingerprints (`AA:BB:…`, 32 bytes), the upload key's and Play App Signing's.
 *
 * Invalid entries are dropped; with none left the document doesn't exist (the route answers 404).
 */

/**
 * Website paths the app handles: each one and everything under it. Must match `APP_LINK_PATHS` in
 * `mobile/app.config.ts`, which claims them (iOS `associatedDomains`, Android `intentFilters` path prefixes).
 */
export const APP_LINK_PATHS = ["/my", "/dashboard", "/manage", "/invitations", "/explore"] as const;

/** A business's booking flow (`/lumen-physio/book`); its other pages stay on the website. The app's `APP_BOOK_PATTERN`. */
export const APP_BOOK_PATH = "/*/book";

/** Paths with no page of their own (only `/manage/{token}`, `/invitations/{token}`): iOS claims only what is under them. */
const WITHOUT_INDEX_PAGE: ReadonlySet<string> = new Set(["/manage", "/invitations"]);

const APPLE_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

export type AppleAppSiteAssociation = {
  applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] };
  webcredentials: { apps: string[] };
};

export type AssetLink = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

/** The non-empty, trimmed entries of a comma-separated value that pass `valid`, without duplicates. */
function validEntries(value: string | undefined, valid: (entry: string) => boolean): string[] {
  const entries = (value ?? "").split(",").map((entry) => entry.trim());
  return [...new Set(entries.filter((entry) => entry && valid(entry)))];
}

/** `/.well-known/apple-app-site-association`, or null without a valid app ID. */
export function appleAppSiteAssociation(appIds: string | undefined): AppleAppSiteAssociation | null {
  const ids = validEntries(appIds, (id) => APPLE_APP_ID.test(id));
  if (!ids.length) return null;
  const components = [
    ...APP_LINK_PATHS.flatMap((path) =>
      WITHOUT_INDEX_PAGE.has(path) ? [{ "/": `${path}/*` }] : [{ "/": path }, { "/": `${path}/*` }],
    ),
    { "/": APP_BOOK_PATH },
  ];
  return {
    applinks: { details: [{ appIDs: ids, components }] },
    // Lets the app's native sign-in (Clerk, passkeys) use this domain's credentials.
    webcredentials: { apps: ids },
  };
}

/** `/.well-known/assetlinks.json`, or null without a valid package name and at least one valid fingerprint. */
export function assetLinks(
  packageName: string | undefined,
  fingerprints: string | undefined,
): AssetLink[] | null {
  const name = packageName?.trim() ?? "";
  const sha256 = validEntries(fingerprints?.toUpperCase(), (fp) => SHA256_FINGERPRINT.test(fp));
  if (!ANDROID_PACKAGE.test(name) || !sha256.length) return null;
  return [
    {
      // Open links in the app, and share this domain's saved sign-ins with it.
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: { namespace: "android_app", package_name: name, sha256_cert_fingerprints: sha256 },
    },
  ];
}

/** A document as served: JSON (no redirect, no extension needed), cached for an hour; 404 while not configured. */
export function appLinksResponse(document: AppleAppSiteAssociation | AssetLink[] | null): Response {
  if (!document) return new Response("Not found", { status: 404 });
  return Response.json(document, { headers: { "Cache-Control": "public, max-age=3600" } });
}
