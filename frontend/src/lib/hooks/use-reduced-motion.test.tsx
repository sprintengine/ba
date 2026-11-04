import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./use-reduced-motion";

function Probe() {
  return <span data-testid="reduce">{String(useReducedMotion())}</span>;
}

/** A matchMedia whose answer can change, with its change listeners. */
function stubMatchMedia(initial: boolean) {
  const mq = { matches: initial, listeners: new Set<() => void>() };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && mq.matches;
    },
    addEventListener: (_: string, fn: () => void) => mq.listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => mq.listeners.delete(fn),
  }));
  return mq;
}

afterEach(() => vi.unstubAllGlobals());

describe("useReducedMotion", () => {
  it("is false on the server", () => {
    expect(renderToString(<Probe />)).toContain(">false<");
  });

  it("follows the preference as it changes, and stops listening on unmount", () => {
    const mq = stubMatchMedia(true);
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId("reduce")).toHaveTextContent("true");
    act(() => {
      mq.matches = false;
      mq.listeners.forEach((fn) => fn());
    });
    expect(screen.getByTestId("reduce")).toHaveTextContent("false");
    unmount();
    expect(mq.listeners.size).toBe(0);
  });
});
