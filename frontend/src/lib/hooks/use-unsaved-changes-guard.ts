"use client";

import { useEffect } from "react";

export const LEAVE_WITH_UNSAVED_CHANGES = "You have unsaved changes. Leave without saving them?";

/**
 * While `dirty`, asks before the page is left: the browser's own prompt when the tab is closed or reloaded, and a
 * confirm when an in-app link is followed (the App Router has no navigation event to cancel, so a click on a
 * same-origin link is caught before Next's <Link> sees it). The back button isn't covered.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = LEAVE_WITH_UNSAVED_CHANGES) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      if (!leavesThePage(event)) return;
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture on the document runs before React's listeners on the app root, so a refused click never reaches <Link>.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

/** A plain left click on a link to another page of this app, in this tab. */
function leavesThePage(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return false;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
  const to = new URL(link.href, window.location.href);
  if (to.origin !== window.location.origin) return false;
  // Same page (a hash or query change on this path) isn't leaving.
  return to.pathname !== window.location.pathname;
}
