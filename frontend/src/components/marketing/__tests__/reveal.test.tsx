import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import { Reveal } from "../reveal";

let reduced = false;
vi.mock("@/lib/hooks/use-reduced-motion", () => ({ useReducedMotion: () => reduced }));

type Observer = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  disconnected: boolean;
};
let observers: Observer[] = [];

beforeEach(() => {
  reduced = false;
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly o: Observer;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.o = { callback, options, disconnected: false };
        observers.push(this.o);
      }
      observe() {}
      disconnect() {
        this.o.disconnected = true;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

/** The observer reports the element, `top` px from the top of the viewport (jsdom's is 768 px tall). */
function intersect(isIntersecting: boolean, top = isIntersecting ? 400 : 2000) {
  const o = must(observers[0], "observer");
  act(() =>
    o.callback(
      [{ isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

describe("Reveal", () => {
  it("is visible in the server's HTML, so it reads without JavaScript and before hydration", () => {
    const html = renderToString(<Reveal className="tile">Hello</Reveal>);
    expect(html).toContain("Hello");
    expect(html).not.toContain("opacity");
  });

  it("lowers content below the fold once hydrated, and fades it up once it scrolls into view", () => {
    render(
      <Reveal delay={0.08} className="tile">
        Hello
      </Reveal>,
    );
    const box = screen.getByText("Hello");
    expect(box).toHaveClass("tile");
    expect(box).not.toHaveStyle({ opacity: "0" });
    expect(must(observers[0], "observer").options?.rootMargin).toBe("0px 0px -80px 0px");

    intersect(false);
    expect(box).toHaveStyle({ opacity: "0", transform: "translateY(18px)" });
    expect(box.style.transition).toBe("none"); // lowered out of sight at once
    intersect(true);
    expect(box).toHaveStyle({ opacity: "1", transform: "none" });
    expect(box.style.transition).toContain("0.6s");
    expect(box.style.transition).toContain("0.08s");
    expect(must(observers[0], "observer").disconnected).toBe(true);
  });

  it("leaves content alone that is already on screen or scrolled past when the page hydrates", () => {
    render(
      <>
        <Reveal>On screen</Reveal>
        <Reveal>Above</Reveal>
      </>,
    );
    intersect(true);
    const above = must(observers[1], "second observer");
    act(() =>
      above.callback(
        [{ isIntersecting: false, boundingClientRect: { top: -900 } } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    for (const text of ["On screen", "Above"])
      expect(screen.getByText(text).getAttribute("style")).toBeNull();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });

  it("appears without a transition for reduced motion", () => {
    reduced = true;
    render(<Reveal aria-hidden>Quiet</Reveal>);
    const box = screen.getByText("Quiet");
    expect(box).toHaveAttribute("aria-hidden", "true");
    intersect(false);
    intersect(true);
    expect(box.style.transition).toBe("none");
    expect(box).toHaveStyle({ opacity: "1" });
  });
});
