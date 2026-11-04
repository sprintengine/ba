import type { Metadata } from "next";
import { PublicQueryProvider } from "@/lib/api/query-provider";
import { ExploreAgentToolsHost } from "@/components/explore/explore-agent-tools-host";

/**
 * Explore is hidden until businesses are listed (nothing links to it): keep its pages out of search results until
 * then, while crawlers may still follow their links to businesses. Remove when Explore launches.
 */
export const metadata: Metadata = { robots: { index: false, follow: true } };

/**
 * Explore reads public listings only: the query client without auth, so it doesn't load Clerk. Its WebMCP tools live
 * here, not in the page, so they stay registered across Explore's pages.
 */
export default function ExploreRouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicQueryProvider>
      <ExploreAgentToolsHost />
      {children}
    </PublicQueryProvider>
  );
}
