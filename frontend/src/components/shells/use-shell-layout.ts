"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/components/ui/use-media-query";

/** Tailwind's `lg` and up (iPad landscape, laptops): the full, collapsible sidebar. Below it the sidebar is a rail. */
export function useIsWideLayout(): boolean {
  return useMediaQuery("(min-width: 1024px)", true);
}

const TEXT_ENTRY =
  "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=true], [contenteditable='']";

/**
 * `true` while the on-screen keyboard is probably up: a text field has focus on a touch screen. (The visual
 * viewport can't tell: Android resizes the layout viewport with it.) Used to get chrome out of the keyboard's way.
 */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    const typing = () => {
      const el = document.activeElement;
      return coarse.matches && el instanceof HTMLElement && el.isConnected && el.matches(TEXT_ENTRY);
    };
    const update = () => {
      const now = typing();
      setOpen(now);
      clearInterval(watch);
      // A field removed while focused (a dialog closing) fires no focus event: keep looking until it is gone.
      if (now) watch = setInterval(() => !typing() && update(), 400);
    };
    // Focus has not moved on yet while `focusout` runs: look once it has.
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 0);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      clearTimeout(timer);
      clearInterval(watch);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}
