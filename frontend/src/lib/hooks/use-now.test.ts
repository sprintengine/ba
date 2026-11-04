import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown, useNow } from "./use-now";

const T0 = new Date("2026-10-05T08:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("useNow", () => {
  it("returns the current time and refreshes it every interval", () => {
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current).toEqual(T0);
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current).toEqual(T0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.getTime()).toBe(T0.getTime() + 30_000);
  });

  it("stays put while paused", () => {
    const { result } = renderHook(() => useNow(null));
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current).toEqual(T0);
  });
});

describe("useCountdown", () => {
  it("counts down to the target every second and stops at zero", () => {
    const { result } = renderHook(() => useCountdown(new Date(T0.getTime() + 2_000).toISOString()));
    expect(result.current).toBe(2_000);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(1_000);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(0);
  });

  it("is null without a target", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBeNull();
  });
});
