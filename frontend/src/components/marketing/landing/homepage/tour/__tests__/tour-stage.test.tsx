import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKED_SERVICE, CLIENT } from "../../fixture";
import { MiniStage } from "../mini-stage";
import { PATHS } from "../tour-app";
import { TourStage } from "../tour-stage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/** The animation a browser would run: jsdom has none. It takes its time on the test's clock, and can be held. */
function animate(_frames: Keyframe[], options?: number | KeyframeAnimationOptions) {
  let left = Number(typeof options === "object" ? options.duration : options) || 0;
  let started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: () => void = () => undefined;
  let abort: () => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    abort = () => reject(new Error("cancelled"));
  });
  const run = () => {
    started = performance.now();
    timer = setTimeout(finish, left);
  };
  run();
  return {
    finished,
    pause() {
      clearTimeout(timer);
      left = Math.max(0, left - (performance.now() - started));
    },
    play: run,
    cancel() {
      clearTimeout(timer);
      abort();
    },
  };
}

const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") && reduce,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

let onScreen: (isIntersecting: boolean) => void;

const play = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** Plays until something is true, as long as a visitor would plausibly have to wait for it. */
async function until(check: () => boolean, limit = 40_000) {
  for (let t = 0; t < limit && !check(); t += 50) await play(50);
  expect(check()).toBe(true);
}

const says = (text: string | RegExp) => () => screen.queryByText(text) !== null;
const landed = (root: HTMLElement) => () =>
  [...root.querySelectorAll("[data-event]")].some((c) => c.textContent.includes(CLIENT.name));
const onChapter = (name: string) => () =>
  screen.getByRole("button", { name }).closest("li")?.getAttribute("aria-current") === "step";

beforeAll(async () => {
  // What the stage loads as it goes: here already, so a test's clock doesn't wait on the module loader.
  await Promise.all([import("../../scenes"), import("../later-screens")]);
});

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(report: (entries: { isIntersecting: boolean }[]) => void) {
        onScreen = (isIntersecting) => report([{ isIntersecting }]);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private report: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
      observe() {
        this.report([{ contentRect: { width: 900, height: 600 } }]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", vi.fn());
  Element.prototype.animate = animate as unknown as Element["animate"];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
});

describe("the hero's tour", () => {
  it("takes a booking from the phone onto the calendar, through the owner's day, and starts over", async () => {
    const { container } = render(<TourStage frameClass="" />);
    expect(onChapter("A client books")()).toBe(true);
    expect(landed(container)()).toBe(false);

    await until(says(/^New booking, paid/));
    expect(screen.getByText(`New booking, paid €${String(BOOKED_SERVICE.priceCents / 100)}`)).toBeVisible();
    expect(screen.getByText(`${CLIENT.name}, 15:30`)).toBeVisible();
    expect(onChapter("It lands")()).toBe(true);
    expect(landed(container)()).toBe(true);
    // The copy that flew there has gone, and the real card shows.
    const card = [...container.querySelectorAll<HTMLElement>("[data-event]")].find((c) =>
      c.textContent.includes(CLIENT.name),
    )!;
    expect(card.style.visibility).toBe("");

    await until(onChapter("Your day"));
    await until(says(CLIENT.email));
    // The address bar follows the cursor's clicks through the rail.
    await until(says(PATHS.overview));
    await until(says(PATHS.customers));
    await until(says(PATHS.reports));
    await until(says(PATHS.calendar));

    await until(onChapter("Your AI"));
    await until(says("Moved to Aoife"));
    expect(screen.getByText(`${CLIENT.name} has been told`)).toBeVisible();

    await until(onChapter("A client books"));
    expect(screen.queryByText("Moved to Aoife")).not.toBeInTheDocument();
    expect(landed(container)()).toBe(false);
  }, 60_000);

  it("stands still while paused, off screen or in a hidden tab, and carries on from there", async () => {
    const { container } = render(<TourStage frameClass="" />);
    fireEvent.click(screen.getByRole("button", { name: "Pause the product tour" }));
    await play(30_000);
    expect(landed(container)()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Play the product tour" }));

    act(() => onScreen(false));
    await play(30_000);
    expect(landed(container)()).toBe(false);
    act(() => onScreen(true));

    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await play(30_000);
    expect(landed(container)()).toBe(false);
    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));

    await until(landed(container));
  }, 60_000);

  it("jumps to a part of the story, with the booking already made", async () => {
    render(<TourStage frameClass="" />);
    fireEvent.click(screen.getByRole("button", { name: "Your AI" }));
    await until(onChapter("Your AI"));
    await until(says("Moved to Aoife"));
  }, 60_000);

  it("opens the booking from Your day without waiting for it to arrive", async () => {
    const { container } = render(<TourStage frameClass="" />);
    fireEvent.click(screen.getByRole("button", { name: "Your day" }));
    await until(onChapter("Your day"));
    await until(landed(container));
    await until(says(CLIENT.email));
  }, 60_000);

  it("hands the phone to the visitor, and lands the booking at the time they pick", async () => {
    const { container } = render(<TourStage frameClass="" />);
    expect(screen.getByText("Choose a service").closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try it: pick a time" }));
    await until(says("Pick a time"));
    expect(screen.getByRole("button", { name: "Your turn: pick a time on the phone" })).toBeDisabled();
    expect(screen.getByText("Pick a time").closest("[inert]")).toBeNull();

    const phone = screen.getByText("Pick a time").closest<HTMLElement>("[data-theme]")!;
    const times = within(phone).getAllByRole("button", { name: /^\d\d:\d\d/ });
    const chosen = times.at(-1)!;
    const at = /\d\d:\d\d/.exec(chosen.textContent)![0];
    fireEvent.click(chosen);

    await until(says(`${CLIENT.name}, ${at}`));
    expect(screen.getByRole("button", { name: "Try it: pick a time" })).toBeEnabled();
    await until(() => !says(`${CLIENT.name}, ${at}`)());
    expect(landed(container)()).toBe(false);
  }, 60_000);

  it("takes the phone back from a visitor who doesn't pick", async () => {
    render(<TourStage frameClass="" />);
    fireEvent.click(screen.getByRole("button", { name: "Try it: pick a time" }));
    await until(says("Pick a time"));
    await play(21_000);
    expect(screen.getByRole("button", { name: "Try it: pick a time" })).toBeEnabled();
    expect(screen.queryByText("Pick a time")).not.toBeInTheDocument();
  }, 60_000);

  it("rests on the finished booking for someone who'd rather not have the motion", async () => {
    reduceMotion(true);
    const { container } = render(<TourStage frameClass="" />);
    await play(5_000);
    expect(screen.getByText(/^New booking, paid/)).toBeVisible();
    expect(landed(container)()).toBe(true);
    expect(screen.queryByRole("button", { name: "Pause the product tour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try it: pick a time" })).not.toBeInTheDocument();
  });
});

describe("the hero's smaller stage", () => {
  it("lands the booking, lets the assistant move it, and starts over", async () => {
    render(<MiniStage frameClass="" />);
    expect(screen.queryByRole("button", { name: "Try it: pick a time" })).not.toBeInTheDocument();
    await until(says(/^New booking, paid/));
    await until(says("Moved to Aoife"));
    await until(() => !says("Moved to Aoife")());
    expect(screen.getByText("Choose a service")).toBeInTheDocument();
  }, 60_000);

  it("rests on the finished booking with reduced motion", async () => {
    reduceMotion(true);
    render(<MiniStage frameClass="" />);
    await play(1_000);
    expect(screen.getByText(/^New booking, paid/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /the product tour/ })).not.toBeInTheDocument();
  });
});
