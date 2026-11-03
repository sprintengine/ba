"use client";

import { useEffect, useRef } from "react";
import { modelContext, registerTools, type ModelContextTool } from "./model-context";

/**
 * Builds a page's tools from a getter of the page's state as last rendered, and the signal that unregisters them (a
 * tool still running when the page goes should change nothing more).
 */
export type AgentToolsFactory<S> = (state: () => S, registration: AbortSignal) => ModelContextTool[];

/**
 * Offers a page's WebMCP tools for as long as it is shown. `load` imports them, so browsers without WebMCP never
 * download them; it runs once, on mount. The tools read `state` as last rendered, so a change an agent made is what
 * its next call sees.
 */
export function useModelContextTools<S>(state: S, load: () => Promise<AgentToolsFactory<S>>) {
  const latest = useRef(state);
  const loader = useRef(load);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    const context = modelContext();
    if (!context) return;
    const controller = new AbortController();
    void loader.current().then((tools) => {
      if (controller.signal.aborted) return;
      registerTools(
        context,
        tools(() => latest.current, controller.signal),
        controller.signal,
      );
    });
    return () => controller.abort();
  }, []);
}
