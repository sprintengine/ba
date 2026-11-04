import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleMount } from "./use-idle-mount";

function Probe({ load, open }: { load: () => Promise<unknown>; open: boolean }) {
  return <span data-testid="mounted">{String(useIdleMount(load, open))}</span>;
}
const mounted = () => screen.getByTestId("mounted").textContent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useIdleMount", () => {
  it("mounts once the page is idle and the module has loaded (a timer where there's no requestIdleCallback)", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const load = vi.fn(() => Promise.resolve());
    render(<Probe load={load} open={false} />);
    expect(mounted()).toBe("false");
    expect(load).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(load).toHaveBeenCalledOnce();
    expect(mounted()).toBe("true");
  });

  it("waits for the browser to go idle where it can", async () => {
    let idle: (() => void) | undefined;
    vi.stubGlobal("requestIdleCallback", (fn: () => void) => ((idle = fn), 7));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    render(<Probe load={() => Promise.resolve()} open={false} />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(mounted()).toBe("false");
    await act(async () => idle?.());
    expect(mounted()).toBe("true");
  });

  it("mounts straight away when opened, and stays unmounted if the preload fails", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const { rerender } = render(<Probe load={() => Promise.reject(new Error("offline"))} open={false} />);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(mounted()).toBe("false");
    rerender(<Probe load={() => Promise.reject(new Error("offline"))} open />);
    expect(mounted()).toBe("true");
  });

  it("cancels the idle callback when unmounted first", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", () => 7);
    vi.stubGlobal("cancelIdleCallback", cancel);
    const { unmount } = render(<Probe load={() => Promise.resolve()} open={false} />);
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
