import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/oauth/app-url";

/**
 * Signed-in, tokenised and internal routes stay out of crawlers' way. Paths are prefixes, and businesses' sites live
 * at `/{slug}`, so a route with an index page is listed as `/x$` and `/x/`: a bare `/my` would also block a business
 * called my-physio, and `/dev` one in Devon. Explore stays crawlable: its pages say noindex themselves.
 */
const DISALLOWED = [
  "/api/",
  "/dashboard$",
  "/dashboard/",
  "/dev/",
  "/invitations/",
  "/manage/",
  "/my$",
  "/my/",
  "/oauth/",
  "/onboarding$",
  "/onboarding/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED },
    sitemap: `${appOrigin()}/sitemap.xml`,
  };
}
