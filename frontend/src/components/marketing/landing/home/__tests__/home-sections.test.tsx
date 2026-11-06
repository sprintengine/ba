import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSection } from "../ai";
import { AnythingStage } from "../anything-stage";
import { CalendarPane, fitCalendar } from "../calendar-pane";
import { CLIENT, dayEntries, BOOKED_SERVICE, demoDay } from "../fixture";
import { LogoMarquee } from "../logo-marquee";
import { ParticleInfinity } from "../particle-infinity";
import { MoneySection } from "../money";
import { ProofSection } from "../proof";
import { SetupDraft } from "../setup-draft";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const reduce = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

beforeEach(() => {
  reduce(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the AI section", () => {
  it("offers the owner's own assistant, once, with the way to connect it, and no Bo", () => {
    const { container } = render(<AiSection />);
    expect(screen.getAllByRole("heading", { name: "Connect your own assistant, included" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "How to connect your assistant" })).toHaveAttribute(
      "href",
      "/help/ai-agents-for-business",
    );
    expect(container.textContent).not.toMatch(/\bBo\b/);
  });
});

describe("the AI section's promise", () => {
  it("leads with the assistant you already have, and doesn't give ours away", () => {
    const { container } = render(<AiSection />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/Use the AI you already have/);
    expect(container.textContent).toMatch(/included on every plan/);
    expect(container.textContent).toMatch(/monthly credits/);
    expect(container.textContent).not.toMatch(/or ours|unlimited/i);
  });
});

describe("the calendar", () => {
  it("counts a booking when it lands, for the person and for the day", () => {
    const booked = {
      who: "sam",
      at: "15:30",
      customer: CLIENT.name,
      service: BOOKED_SERVICE,
      room: "Room 1",
    };
    const fit = fitCalendar(1000, 640);
    const { rerender, container } = render(
      <CalendarPane date={demoDay()} entries={dayEntries([])} {...fit} />,
    );
    expect(container.textContent).toMatch(/Sam Rivers.{0,8}3 booked/);
    expect(container.textContent).toMatch(/10 bookings · Dublin/);
    rerender(<CalendarPane date={demoDay()} entries={dayEntries([booked])} {...fit} />);
    expect(container.textContent).toMatch(/Sam Rivers.{0,8}4 booked/);
    expect(container.textContent).toMatch(/11 bookings · Dublin/);
  });
});

describe("the setup draft", () => {
  it("keeps what the owner wrote apart from what we suggest, and asks them to check it", () => {
    render(<SetupDraft />);
    const draft = screen.getByRole("region", { name: "Your draft" });
    expect(draft).toHaveTextContent(/Check your draft/);
    expect(draft).toHaveTextContent(/Not live yet/);
    expect(draft).toHaveTextContent(/From what you wrote.*Suggested, for you to change/);
    // The sentence gives no names, so the draft doesn’t claim any.
    expect(draft).not.toHaveTextContent(/Aoife|Niamh/);
  });
});

describe("the particle infinity", () => {
  it("says so where WebGL isn’t available", () => {
    const onFailed = vi.fn();
    const slot = { current: document.createElement("div") };
    render(<ParticleInfinity slot={slot} onDrawing={vi.fn()} onFailed={onFailed} />);
    expect(onFailed).toHaveBeenCalled();
  });

  it("is the drawn symbol, with no canvas, under reduced motion", () => {
    reduce(true);
    const { container } = render(<AnythingStage>Words</AnythingStage>);
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("the logo marquee", () => {
  it("hides the repeated run from assistive tech", () => {
    const { container } = render(<LogoMarquee />);
    const runs = container.querySelectorAll("ul");
    expect(runs).toHaveLength(2);
    expect(runs[0]).not.toHaveAttribute("aria-hidden");
    expect(runs[1]).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("img", { name: "Stripe" })).toBeInTheDocument();
  });

  it("names every provider the FAQ does", () => {
    const { container } = render(<LogoMarquee />);
    expect(container.querySelector("ul")).toHaveTextContent("Mollie");
  });

  it("is one still row with reduced motion", () => {
    reduce(true);
    const { container } = render(<LogoMarquee />);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
  });
});

describe("what the page may claim", () => {
  it("keeps the proof to what the owner gets, in plain words, with no invented figures", () => {
    const { container } = render(<ProofSection />);
    expect(container.textContent).toMatch(/gone for everyone else/i);
    expect(container.textContent).not.toMatch(/same moment|\d{2},\d{3}/i);
    expect(screen.getByRole("link", { name: "See the examples" })).toHaveAttribute("href", "#industries");
    expect(container.textContent).not.toMatch(/database|\brace\b|concurren/i);
    expect(container.textContent).not.toMatch(/trusted by|uptime|99\.\d/i);
  });

  it("says the platform takes nothing", () => {
    const { container } = render(<MoneySection />);
    expect(container.textContent).toMatch(/We take 0%/);
    expect(container.textContent).toMatch(/€0\.00/);
  });
});
