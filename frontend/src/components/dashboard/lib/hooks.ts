"use client";

import { useMediaQuery } from "@/components/ui/use-media-query";

/** Below Tailwind's `sm` breakpoint (640px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}

/** True when the event target is somewhere keyboard shortcuts must not fire (inputs, editors, menus). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!target.closest("[role=dialog],[role=menu],[role=listbox],[role=combobox],[cmdk-root]");
}
