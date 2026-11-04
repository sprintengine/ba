import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoStage } from "../demo-stage";
import { finalState, type DemoChapter } from "../types";

type S = { text: string; clicked: boolean };

const one: DemoChapter<S> = {
  id: "one",
  label: "Type",
  caption: "Types a word.",
  url: () => "example.test/one",
  initial: { text: "", clicked: false },
  steps: [
    { kind: "type", target: "field", text: "hello", apply: (s, text) => ({ ...s, text }) },
    { kind: "click", target: "button", apply: (s) => ({ ...s, clicked: true }) },
  ],
};
const two: DemoChapter<S> = { ...one, id: "two", label: "Second", caption: "The second chapter.", steps: [] };

function App(s: S) {
  return (
    <div>
      <span data-demo="field">{s.text}</span>
      <span data-demo="button">{s.clicked ? "Clicked" : "Not yet"}</span>
    </div>
  );
}

let visible = true;
let reduced = false;
vi.mock("@/lib/hooks/use-reduced-motion", () => ({ useReducedMotion: () => reduced }));

beforeEach(() => {
  visible = true;
  reduced = false;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("finalState", () => {
  it("folds every state change in order", () => {
    expect(finalState(one)).toEqual({ text: "hello", clicked: true });
  });
});

describe("DemoStage", () => {
  it("hides the replica from assistive tech and describes the chapter instead", () => {
    render(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    expect(screen.getByRole("figure", { name: "A demo" })).toBeInTheDocument();
    expect(screen.getByText("Types a word.")).toBeInTheDocument();
    // Autoplay changes the caption every few seconds: it is read when reached, never announced.
    expect(screen.getByText("Types a word.").closest("[aria-live]")).toBeNull();
    expect(screen.queryByText("Not yet")?.closest("[aria-hidden]")).not.toBeNull();
    expect(screen.getByText("example.test/one")).toBeInTheDocument();
  });

  it("renders the replica (and so loads its chunk) only once the stage nears the viewport", () => {
    visible = false;
    render(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    expect(screen.getByRole("figure", { name: "A demo" })).toBeInTheDocument();
    expect(screen.queryByText("Not yet")).not.toBeInTheDocument();
  });

  it("is sized in CSS, so the server's HTML already has the frame's final height", () => {
    const html = renderToString(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    // The design size plus the browser chrome's 44px bar, scaled to the column by CSS rather than measured
    // (demo.module.css reads the aspect ratio; phones crop it to a camera on the cursor).
    expect(html).toContain("--ar:400 / 344");
    expect(html).toContain("--dw:400px");
    expect(html).toContain("--dh:344px");
    expect(html).not.toContain("scale(");
  });

  it("plays the script: typing, then the click's state change", async () => {
    vi.useFakeTimers();
    render(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    // The first chapter ran to the end and the stage moved on to the second, which restarts from its initial state.
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute("aria-current", "step");
  });

  it("jumps to a chapter from its pill, and can be paused", async () => {
    const user = userEvent.setup();
    render(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Second" }));
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("The second chapter.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause the demo" }));
    expect(screen.getByRole("button", { name: "Play the demo" })).toBeInTheDocument();
  });

  it("shows the chapter picked while paused, and plays it", async () => {
    const user = userEvent.setup();
    const later: DemoChapter<S> = { ...two, initial: { text: "Second chapter", clicked: false } };
    render(
      <DemoStage
        chapters={[one, later]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pause the demo" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    expect(await screen.findByText("Second chapter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause the demo" })).toBeInTheDocument();
  });

  it("with reduced motion, shows each chapter's result and no cursor or pause", () => {
    reduced = true;
    render(
      <DemoStage
        chapters={[one, two]}
        width={400}
        height={300}
        start={{ x: 0, y: 0 }}
        label="A demo"
        render={App}
      />,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("Clicked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause the demo" })).not.toBeInTheDocument();
  });
});
