import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows two on a phone until asked for more", () => {
    render(<BusinessExamples />);
    const third = screen.getByRole("button", { name: new RegExp(EXAMPLE_CARDS[2]!.label) });
    expect(third.closest("li")).toHaveClass("max-sm:hidden");
    expect(
      screen.getByRole("button", { name: new RegExp(EXAMPLE_CARDS[1]!.label) }).closest("li"),
    ).not.toHaveClass("max-sm:hidden");
    fireEvent.click(screen.getByRole("button", { name: "See more examples" }));
    expect(third.closest("li")).not.toHaveClass("max-sm:hidden");
    expect(screen.queryByRole("button", { name: "See more examples" })).not.toBeInTheDocument();
  });

  it("doesn't load the calendar until a card is opened", () => {
    render(<BusinessExamples />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
