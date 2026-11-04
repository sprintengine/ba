import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KitchenSink } from "./kitchen-sink";

describe("KitchenSink", () => {
  it("renders every section, each linked from the header", () => {
    const { container } = render(
      <TooltipProvider>
        <KitchenSink />
      </TooltipProvider>,
    );
    expect(screen.getByRole("heading", { name: "Design system" })).toBeInTheDocument();
    const links = [...container.querySelectorAll("nav a")].map((a) => a.getAttribute("href")?.slice(1));
    expect(links).toHaveLength(13);
    for (const id of links) expect(container.querySelector(`section#${id}`)).not.toBeNull();
  });
});
