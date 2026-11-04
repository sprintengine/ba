"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMarketplaceMeta } from "@/lib/api/hooks/use-marketplace";
import { useModelContextTools } from "@/lib/webmcp/use-model-context-tools";
import { useExploreNavigate } from "./use-explore-filters";

/**
 * Offers Explore to an AI agent in the browser as WebMCP tools (`explore-agent-tools.ts`). Rendered by Explore's
 * layout, so the tools stay registered while a search moves between `/explore` and a city's page.
 */
export function ExploreAgentToolsHost() {
  const router = useRouter();
  const meta = useMarketplaceMeta();
  const queryClient = useQueryClient();
  const navigate = useExploreNavigate();
  useModelContextTools(
    { meta: meta.data, navigate, open: (href: string) => router.push(href), queryClient },
    () =>
      import("./explore-agent-tools").then(
        ({ exploreAgentTools }) =>
          (page, registration) =>
            exploreAgentTools({ page, registration }),
      ),
  );
  return null;
}
