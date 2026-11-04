import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./stat";

describe("StatCard", () => {
  it("keeps the label to one line, with the whole of it in a tooltip", () => {
    render(<StatCard label="Appointments (30 days)" value="128" />);
    const label = screen.getByText("Appointments (30 days)");
    expect(label).toHaveClass("truncate", "min-w-0");
    expect(label).toHaveAttribute("title", "Appointments (30 days)");
    expect(screen.getByText("128")).toBeInTheDocument();
  });
});
