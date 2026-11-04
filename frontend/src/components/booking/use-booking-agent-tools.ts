"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { modelContext, registerTools } from "@/lib/webmcp/model-context";
import type { BookingFlowModel } from "./use-booking-flow";

/**
 * Offers the booking flow to an AI agent in the browser as WebMCP tools (`booking-agent-tools.ts`), for as long as
 * the flow is shown. Browsers without WebMCP never load the tools.
 */
export function useBookingAgentTools(flow: BookingFlowModel) {
  const queryClient = useQueryClient();
  // The tools are registered once and read the flow as last rendered.
  const latest = useRef(flow);
  useEffect(() => {
    latest.current = flow;
  });
  useEffect(() => {
    const context = modelContext();
    if (!context) return;
    const controller = new AbortController();
    void import("./booking-agent-tools").then(({ bookingAgentTools }) => {
      if (controller.signal.aborted) return;
      registerTools(
        context,
        bookingAgentTools({ flow: () => latest.current, queryClient }),
        controller.signal,
      );
    });
    return () => controller.abort();
  }, [queryClient]);
}
