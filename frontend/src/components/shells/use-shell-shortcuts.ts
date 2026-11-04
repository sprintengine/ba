"use client";

import { useEffect } from "react";

/** Dashboard chrome shortcuts: ⌘K / Ctrl+K toggles the command menu, ⌘\ / Ctrl+\ collapses the sidebar. */
export function useShellShortcuts({
  onToggleCommand,
  onToggleSidebar,
}: {
  onToggleCommand: () => void;
  onToggleSidebar: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggleCommand();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        onToggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleCommand, onToggleSidebar]);
}
