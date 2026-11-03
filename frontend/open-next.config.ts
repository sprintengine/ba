import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * The site on Cloudflare Workers (docs/deployment.md). Prerendered pages and the server's cached backend reads
 * (`lib/api/server.ts`, `next: { revalidate }`) live in an R2 bucket per environment (`NEXT_INC_CACHE_R2_BUCKET` in
 * wrangler.jsonc); `opennextjs-cloudflare deploy` uploads the prerendered pages to it. No page uses ISR, so there is no
 * revalidation queue.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
