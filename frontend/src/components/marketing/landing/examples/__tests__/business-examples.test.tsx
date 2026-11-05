import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessExamples } from "../business-examples";
import { EXAMPLE_CARDS } from "../cards";

describe("the example cards", () => {
  it("offers each kind of business as a button with a described photo, and a way in for anyone else", () => {
    render(<BusinessExamples />);
    for (const c of EXAMPLE_CARDS) {
      expect(screen.getByRole("button", { name: new RegExp(c.label) })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: c.alt })).toHaveAttribute(
        "src",
        `/examples/${c.photo}-960.webp`,
      );
    }
    expect(screen.getByRole("link", { name: "Describe your business" })).toHaveAttribute("href", "/sign-up");
  });

  it("doesn't load the calendar until a card is opened", () => {
    render(<BusinessExamples />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
