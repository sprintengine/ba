"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useModelContextTools } from "@/lib/webmcp/use-model-context-tools";
import type { BookingFlowModel } from "./use-booking-flow";

/**
 * Offers the booking flow to an AI agent in the browser as WebMCP tools (`booking-agent-tools.ts`), for as long as
 * the flow is shown. Browsers without WebMCP never load the tools.
 */
export function useBookingAgentTools(flow: BookingFlowModel) {
  const queryClient = useQueryClient();
  useModelContextTools(flow, () =>
    import("./booking-agent-tools").then(
      ({ bookingAgentTools }) =>
        (state) =>
          bookingAgentTools({ flow: state, queryClient }),
    ),
  );
}
