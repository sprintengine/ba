"use client";

import { useCallback, useEffect, useState } from "react";

const COLLAPSE_KEY = "bookanything.sidebarCollapsed";

/** The dashboard sidebar's collapsed state, persisted in localStorage (restored after hydration). */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Restore persisted sidebar state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }, []);

  return { collapsed, toggleCollapsed };
}
