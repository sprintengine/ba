import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlParams, withSearchParams } from "./use-url-params";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/x/bookings",
  useSearchParams: () => new URLSearchParams(search),
}));

describe("withSearchParams", () => {
  it("sets, replaces and removes keys, keeping the others", () => {
    expect(withSearchParams("/p", "a=1&b=2", { b: "3", c: "4" })).toBe("/p?a=1&b=3&c=4");
    expect(withSearchParams("/p", new URLSearchParams("a=1&b=2"), { a: null })).toBe("/p?b=2");
    expect(withSearchParams("/p", "a=1", { a: "" })).toBe("/p");
  });

  it("drops the question mark when nothing is left", () => {
    expect(withSearchParams("/p", "", {})).toBe("/p");
    expect(withSearchParams("/p", "range=7d", { range: null })).toBe("/p");
  });

  it("encodes values", () => {
    expect(withSearchParams("/p", "", { q: "a&b c" })).toBe("/p?q=a%26b+c");
  });
});

describe("useUrlParams", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.spyOn(window.history, "replaceState").mockImplementation(replace);
    search = "range=today&status=confirmed";
  });

  it("patches the current params with history.replaceState (no server round trip, no scrolling)", () => {
    const { result } = renderHook(() => useUrlParams());
    expect(result.current.params.get("range")).toBe("today");
    act(() => result.current.setParams({ range: null, q: "alex" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/dashboard/x/bookings?status=confirmed&q=alex");
  });

  it("clears every param", () => {
    const { result } = renderHook(() => useUrlParams());
    act(() => result.current.clearParams());
    expect(replace).toHaveBeenCalledWith(null, "", "/dashboard/x/bookings");
  });
});
