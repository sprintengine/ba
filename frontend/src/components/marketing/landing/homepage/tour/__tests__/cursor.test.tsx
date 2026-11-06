import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Cursor, pointer } from "../cursor";
import { createDirector } from "../director";

type Frames = { transform: string }[];

/** The stage at the page's origin, and a target somewhere on it. */
function setup() {
  const ref = createRef<HTMLDivElement>();
  const { container } = render(
    <div>
      <Cursor ref={ref} />
      <button type="button">Target</button>
      <button type="button">Other</button>
    </div>,
  );
  const stage = container.firstElementChild as HTMLElement;
  const [target, other] = [...container.querySelectorAll("button")];
  const director = createDirector();
  return { el: ref.current!, stage, target: target!, other: other!, director };
}

const box = (el: Element, left: number, top: number) =>
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + 20,
    bottom: top + 20,
    width: 20,
    height: 20,
    x: left,
    y: top,
    toJSON: () => ({}),
  });

let frames: Frames[];

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  Element.prototype.animate = function animate(
    keyframes: Keyframe[],
    options?: number | KeyframeAnimationOptions,
  ) {
    frames.push(keyframes as Frames);
    const duration = Number(typeof options === "object" ? options.duration : options) || 0;
    return {
      finished: new Promise((resolve) => setTimeout(resolve, duration)),
      pause: () => undefined,
      play: () => undefined,
      cancel: () => undefined,
    };
  } as unknown as Element["animate"];
});

afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as Partial<Element>).animate;
});

describe("the hero's cursor", () => {
  it("glides on a curve to the middle of a target, and lights it as it arrives", async () => {
    const { el, stage, target, director } = setup();
    box(target, 300, 200);
    const cursor = pointer(el, stage, director);

    const going = cursor.moveTo(target);
    expect(target).not.toHaveAttribute("data-hover");
    await vi.advanceTimersByTimeAsync(5_000);
    await going;

    expect(target).toHaveAttribute("data-hover");
    expect(el.style.transform).toBe("translate(310px, 210px)");
    const path = frames[0]!;
    expect(path[0]!.transform).toBe("translate(0.0px, 0.0px)");
    expect(path.at(-1)!.transform).toBe("translate(310.0px, 210.0px)");
    // Off the straight line in between, as a wrist bends it.
    const [x, y] = path[20]!.transform.match(/-?\d+\.\d/g)!.map(Number) as [number, number];
    expect(Math.abs(y - (x * 210) / 310)).toBeGreaterThan(1);
  });

  it("bends the other way on the next move, and moves the light with it", async () => {
    const { el, stage, target, other, director } = setup();
    box(target, 300, 200);
    box(other, 0, 0);
    const cursor = pointer(el, stage, director);
    const first = cursor.moveTo(target);
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    const second = cursor.moveTo(other);
    expect(target).not.toHaveAttribute("data-hover");
    await vi.advanceTimersByTimeAsync(5_000);
    await second;
    expect(other).toHaveAttribute("data-hover");
  });

  it("clicks the real control, after moving there", async () => {
    const { el, stage, target, director } = setup();
    box(target, 100, 100);
    const clicked = vi.fn();
    target.addEventListener("click", clicked);
    const cursor = pointer(el, stage, director);
    const going = cursor.click(target);
    await vi.advanceTimersByTimeAsync(5_000);
    await going;
    expect(clicked).toHaveBeenCalledOnce();
    cursor.leave();
    expect(target).not.toHaveAttribute("data-hover");
  });

  it("stays put for a target it's already on", async () => {
    const { el, stage, target, director } = setup();
    const cursor = pointer(el, stage, director);
    await cursor.moveTo(target);
    expect(frames).toEqual([]);
    expect(target).toHaveAttribute("data-hover");
  });
});
