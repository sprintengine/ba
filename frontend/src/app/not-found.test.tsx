import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NotFound, { metadata } from "./not-found";
import RootError from "./error";

describe("error pages", () => {
  it("titles the not found page and heads it with an h1", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    // The root layout's template adds " · bookanything".
    expect(metadata.title).toBe("Page not found");
  });

  it("heads the error page with an h1", () => {
    render(<RootError error={new Error("Boom")} reset={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
  });

  it("offers to try again without the auth or query providers (they are not mounted on every page)", () => {
    const reset = vi.fn();
    render(<RootError error={new Error("Boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
