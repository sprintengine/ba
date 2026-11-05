import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMeasuredWidth } from "../use-measured-width";

function Box() {
  const ref = useRef<HTMLDivElement>(null);
  useMeasuredWidth(ref);
  return <div ref={ref} data-testid="box" />;
}

describe("useMeasuredWidth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps --mw at the element's width and stops watching on unmount", () => {
    let report = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          report = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { getByTestId, unmount } = render(<Box />);
    const box = getByTestId("box");
    Object.defineProperty(box, "clientWidth", { value: 1120, configurable: true });
    report();
    expect(box.style.getPropertyValue("--mw")).toBe("1120px");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
