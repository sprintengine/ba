import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// `expect(await axe(element)).toHaveNoViolations()`; tests use `expectNoAxeViolations` (src/test/axe.ts).
expect.extend(axeMatchers);

// Node ≥ 22 ships an experimental global `localStorage` that shadows jsdom's and
// lacks methods unless --localstorage-file is set. Install a real in-memory one.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    // Storage coerces whatever callers pass, as the DOM does.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
    this.store.set(key, String(value));
  }
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// jsdom lacks these although the DOM types declare them (hence the Partial views); Radix and cmdk rely on them.
if (typeof window !== "undefined") {
  const element: Partial<HTMLElement> = window.HTMLElement.prototype;
  element.scrollIntoView ??= function scrollIntoView() {};
  element.hasPointerCapture ??= () => false;
  element.releasePointerCapture ??= () => {};
  (window.Element.prototype as Partial<Element>).scrollTo ??= function scrollTo() {};
  (window as Partial<Window>).matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  (globalThis as Partial<typeof globalThis>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
