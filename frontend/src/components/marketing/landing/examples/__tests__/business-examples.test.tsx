import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessExamples } from "../business-examples";
import { EXAMPLE_CARDS } from "../cards";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("the example tabs", () => {
  it("offers each kind of business as a button with a described photo, and a way in for anyone else", () => {
    render(<BusinessExamples />);
    for (const c of EXAMPLE_CARDS) {
      expect(screen.getByRole("button", { name: new RegExp(c.label) })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: c.alt })).toHaveAttribute(
        "src",
        `/examples/${c.photo}-480.webp`,
      );
    }
    expect(screen.getByRole("link", { name: "Describe your business" })).toHaveAttribute("href", "/sign-up");
  });

  it("starts on the first kind of business, and picking another changes which is pressed", () => {
    render(<BusinessExamples />);
    const first = screen.getByRole("button", { name: new RegExp(EXAMPLE_CARDS[0]!.label) });
    const second = screen.getByRole("button", { name: new RegExp(EXAMPLE_CARDS[1]!.label) });
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });
});
