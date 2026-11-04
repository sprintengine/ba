import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesSection } from "../features";
import { SeeItWorkSection } from "../see-it-work";

beforeEach(() =>
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const tileTitles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("FeaturesSection: the AI tile", () => {
  it("by default, offers the owner's own AI assistant instead of Bo", () => {
    const { container } = render(<FeaturesSection />);
    expect(screen.getAllByRole("article")).toHaveLength(8);
    expect(tileTitles()[2]).toBe("Bring your own AI assistant");
    expect(container.textContent).not.toMatch(/\bBo\b/);
  });

  it("presents Bo where Bo is offered", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
    render(<FeaturesSection />);
    expect(screen.getAllByRole("article")).toHaveLength(8);
    expect(tileTitles()[2]).toBe("Bo, an assistant for your team");
    expect(tileTitles()).not.toContain("Bring your own AI assistant");
  });

  it("keeps the grid's eight tiles with a non-AI feature when the business server is off too", () => {
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_MCP_ENABLED", "false");
    render(<FeaturesSection />);
    expect(screen.getAllByRole("article")).toHaveLength(8);
    expect(tileTitles()[2]).toBe("Classes and group sessions");
    expect(tileTitles().join(" ")).not.toMatch(/AI assistant|\bBo\b/);
  });
});

describe("SeeItWorkSection: the lead", () => {
  const lead = () =>
    screen.getByRole("region", { name: /Watch a clinic get set up/ }).querySelector("p + h2 + p");

  it("doesn't mention Bo by default (the demo has no Bo chapter)", () => {
    render(<SeeItWorkSection />);
    expect(lead()).toHaveTextContent(
      "A physio clinic adds a service, opens on Saturday mornings and takes a paid booking online.",
    );
    expect(lead()?.textContent).not.toMatch(/\bBo\b/);
  });

  it("ends on asking Bo where Bo is offered", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
    render(<SeeItWorkSection />);
    expect(lead()).toHaveTextContent("takes a paid booking online and asks Bo for help.");
  });
});
