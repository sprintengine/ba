"use client";

import { useEffect } from "react";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { isTypingTarget } from "../lib/hooks";

/** Calendar shortcuts: ←/→ move, t today, d/w view, n new booking. Off while typing or in a dialog. */
export function useCalendarKeyboard({
  go,
  setParams,
  onNew,
}: {
  go: (delta: number) => void;
  setParams: (patch: UrlParamsPatch) => void;
  onNew: () => void;
}) {
  useEffect(() => {
    const actions = new Map<string, () => void>([
      ["ArrowLeft", () => go(-1)],
      ["ArrowRight", () => go(1)],
      ["t", () => setParams({ date: null })],
      ["d", () => setParams({ view: null })],
      ["w", () => setParams({ view: "week" })],
      ["n", onNew],
    ]);
    const onKey = (e: KeyboardEvent) => {
      // A focused control that handled the key itself (the Day/Week switcher's arrows) keeps it.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      const action = actions.get(e.key);
      if (!action) return;
      action();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, setParams, onNew]);
}
