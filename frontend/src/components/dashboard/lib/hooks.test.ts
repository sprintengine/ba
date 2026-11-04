import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTypingTarget, useIsMobile } from "./hooks";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** A `matchMedia` whose result can be flipped, notifying the listeners like a resize would. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((media: string) => ({
    get matches() {
      return matches;
    },
    media,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

describe("useIsMobile", () => {
  it("follows the small-screen media query and unsubscribes on unmount", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe("isTypingTarget", () => {
  const el = (html: string, selector: string) => {
    document.body.innerHTML = html;
    return document.querySelector(selector);
  };

  it("is true in fields, editors, dialogs, menus, listboxes, comboboxes and ⌘K", () => {
    expect(isTypingTarget(el("<input />", "input"))).toBe(true);
    expect(isTypingTarget(el("<textarea></textarea>", "textarea"))).toBe(true);
    expect(isTypingTarget(el("<select></select>", "select"))).toBe(true);
    const editor = el("<div>text</div>", "div") as HTMLElement;
    Object.defineProperty(editor, "isContentEditable", { value: true });
    expect(isTypingTarget(editor)).toBe(true);
    for (const role of ["dialog", "menu", "listbox", "combobox"]) {
      expect(isTypingTarget(el(`<div role="${role}"><button>x</button></div>`, "button"))).toBe(true);
    }
    expect(isTypingTarget(el("<div cmdk-root><button>x</button></div>", "button"))).toBe(true);
  });

  it("is false elsewhere, and for targets that aren't elements", () => {
    expect(isTypingTarget(el("<main><button>x</button></main>", "button"))).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
