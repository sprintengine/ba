import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroStage } from "../hero-stage";

vi.mock("../tour/tour-stage", () => ({ TourStage: () => <p>The tour</p> }));
vi.mock("../scenes", () => ({ MiniStage: () => <p>The small stage</p> }));

const screenWide = (wide: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

afterEach(() => vi.unstubAllGlobals());

describe("the hero's stage", () => {
  beforeEach(() => screenWide(true));

  it("names what it shows, and paints its empty frames first", () => {
    render(<HeroStage />);
    expect(screen.getByRole("group", { name: /a client books on a phone/ })).toBeInTheDocument();
    expect(screen.queryByText("The tour")).not.toBeInTheDocument();
  });

  it("brings the tour to a desktop once the page has gone quiet", async () => {
    render(<HeroStage />);
    expect(await screen.findByText("The tour")).toBeInTheDocument();
    expect(screen.queryByText("The small stage")).not.toBeInTheDocument();
  });

  it("gives a narrower screen the booking alone", async () => {
    screenWide(false);
    render(<HeroStage />);
    expect(await screen.findByText("The small stage")).toBeInTheDocument();
    expect(screen.queryByText("The tour")).not.toBeInTheDocument();
  });

  it("waits for an idle moment where the browser has them, and calls it off if the page goes", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", (run: () => void) => {
      run();
      return 7;
    });
    vi.stubGlobal("cancelIdleCallback", cancel);
    const { unmount } = render(<HeroStage />);
    expect(await screen.findByText("The tour")).toBeInTheDocument();
    unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(7));
  });
});
