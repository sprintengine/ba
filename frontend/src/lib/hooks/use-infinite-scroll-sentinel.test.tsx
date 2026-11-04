import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import { useInfiniteScrollSentinel } from "./use-infinite-scroll-sentinel";

type Observer = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
};
let observers: Observer[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly o: Observer;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.o = { callback, options, observed: [], disconnected: false };
        observers.push(this.o);
      }
      observe(el: Element) {
        this.o.observed.push(el);
      }
      disconnect() {
        this.o.disconnected = true;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function List(props: Parameters<typeof useInfiniteScrollSentinel>[0] & { showSentinel?: boolean }) {
  const { showSentinel = true, ...options } = props;
  const sentinel = useInfiniteScrollSentinel(options);
  return <div>{showSentinel && <div data-testid="sentinel" ref={sentinel} />}</div>;
}

const intersect = (o: Observer, isIntersecting: boolean) =>
  o.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
const live = () => {
  const o = observers.filter((x) => !x.disconnected);
  expect(o).toHaveLength(1);
  return must(o[0], "the live observer");
};

describe("useInfiniteScrollSentinel", () => {
  it("loads the next page when the sentinel comes into view", () => {
    const fetchNextPage = vi.fn(async () => {});
    const { getByTestId } = render(
      <List hasNextPage isFetchingNextPage={false} fetchNextPage={fetchNextPage} rootMargin="240px" />,
    );
    const o = live();
    expect(o.observed).toEqual([getByTestId("sentinel")]);
    expect(o.options).toEqual({ root: null, rootMargin: "240px" });
    intersect(o, false);
    expect(fetchNextPage).not.toHaveBeenCalled();
    intersect(o, true);
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("does nothing while a page is loading or when there are no more pages", () => {
    const fetchNextPage = vi.fn(async () => {});
    const { rerender } = render(<List hasNextPage isFetchingNextPage fetchNextPage={fetchNextPage} />);
    intersect(live(), true);
    rerender(<List hasNextPage={false} isFetchingNextPage={false} fetchNextPage={fetchNextPage} />);
    intersect(live(), true);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("observes within the given root and starts once the sentinel mounts", () => {
    const root = document.createElement("div");
    const getRoot = () => root;
    const fetchNextPage = vi.fn(async () => {});
    const { rerender, unmount } = render(
      <List
        hasNextPage
        isFetchingNextPage={false}
        fetchNextPage={fetchNextPage}
        getRoot={getRoot}
        showSentinel={false}
      />,
    );
    expect(observers).toHaveLength(0);
    rerender(<List hasNextPage isFetchingNextPage={false} fetchNextPage={fetchNextPage} getRoot={getRoot} />);
    expect(live().options?.root).toBe(root);
    unmount();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});
