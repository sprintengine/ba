"use client";

import { useCallback, useEffect, useState } from "react";

const COLLAPSE_KEY = "bookanything.sidebarCollapsed";

/** A small window with a mouse: the rail leaves the page room until the person says otherwise. */
const SMALL_WINDOW = "(max-width: 1279px) and (pointer: fine)";

/**
 * The dashboard sidebar's collapsed state, persisted in localStorage (restored after hydration). With no choice saved
 * it starts collapsed in a small window; once someone toggles it, their choice holds at every size.
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_KEY);
    // Restore persisted sidebar state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(saved === null ? window.matchMedia(SMALL_WINDOW).matches : saved === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }, []);

  return { collapsed, toggleCollapsed };
}
