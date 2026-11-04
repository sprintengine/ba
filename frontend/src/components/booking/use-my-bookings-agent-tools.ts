"use client";

import { useModelContextTools } from "@/lib/webmcp/use-model-context-tools";
import type { MyBookingsAgentPage } from "./my-bookings-agent-tools";

/** Offers My bookings to an AI agent in the browser as WebMCP tools (`my-bookings-agent-tools.ts`). */
export function useMyBookingsAgentTools(page: MyBookingsAgentPage) {
  useModelContextTools(page, () =>
    import("./my-bookings-agent-tools").then(
      ({ myBookingsAgentTools }) =>
        (state) =>
          myBookingsAgentTools({ page: state }),
    ),
  );
}
