import type { MetadataRoute } from "next";
import { INDUSTRIES } from "@/components/shells/industries";
import { AI_HELP_PATH, BUSINESS_AI_HELP_PATH, appOrigin, businessAgentsLive } from "@/lib/oauth/app-url";

/**
 * The marketing pages search engines should index. Not Explore (hidden, and noindex, until businesses are listed:
 * see explore/layout.tsx), the draft legal pages (noindex) or anything signed in.
 */
const SITEMAP_PATHS = ["/", "/pricing", ...INDUSTRIES.map((i) => `/for/${i.slug}`), AI_HELP_PATH];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  // The business agents guide, once its server is live.
  const paths = businessAgentsLive() ? [...SITEMAP_PATHS, BUSINESS_AI_HELP_PATH] : SITEMAP_PATHS;
  return paths.map((path) => ({ url: path === "/" ? origin : `${origin}${path}` }));
}
