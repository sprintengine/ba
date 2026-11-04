import { appleAppSiteAssociation, appLinksResponse } from "@/lib/app-links";

/** Read at request time: the environment is the server's (`next start`), not the build's. */
export const dynamic = "force-dynamic";

/** iOS universal links and shared web credentials for the app IDs in `APPLE_APP_IDS` (lib/app-links). */
export function GET(): Response {
  return appLinksResponse(appleAppSiteAssociation(process.env.APPLE_APP_IDS));
}
