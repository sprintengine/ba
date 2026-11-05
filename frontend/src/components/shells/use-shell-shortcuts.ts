"use client";

import { useEffect } from "react";

/** Dashboard chrome shortcut: ⌘K / Ctrl+K toggles the command menu. */
export function useShellShortcuts({ onToggleCommand }: { onToggleCommand: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggleCommand();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleCommand]);
}
