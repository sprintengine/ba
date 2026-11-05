import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSection } from "../ai";
import { LogoMarquee } from "../logo-marquee";
import { MoneySection } from "../money";
import { ProofSection } from "../proof";

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
    expect(screen.getAllByRole("heading", { name: "Bring your own AI assistant" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "How to connect your assistant" })).toHaveAttribute(
      "href",
      "/help/ai-agents-for-business",
    );
    expect(container.textContent).not.toMatch(/\bBo\b/);
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

  it("is one still row with reduced motion", () => {
    reduce(true);
    const { container } = render(<LogoMarquee />);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
  });
});

describe("what the page may claim", () => {
  it("keeps the proof to our own testing, and says it isn't customers", () => {
    const { container } = render(<ProofSection />);
    expect(container.textContent).toMatch(/bots, not customers/);
    expect(container.textContent).not.toMatch(/trusted by|uptime|99\.\d/i);
  });

  it("says the platform takes nothing", () => {
    const { container } = render(<MoneySection />);
    expect(container.textContent).toMatch(/We take 0%/);
    expect(container.textContent).toMatch(/€0\.00/);
  });
});
