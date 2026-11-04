import { appLinksResponse, assetLinks } from "@/lib/app-links";

/** Read at request time: the environment is the server's (`next start`), not the build's. */
export const dynamic = "force-dynamic";

/** Android App Links for `ANDROID_PACKAGE_NAME` signed with `ANDROID_SHA256_FINGERPRINTS` (lib/app-links). */
export function GET(): Response {
  return appLinksResponse(
    assetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_FINGERPRINTS),
  );
}
