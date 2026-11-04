import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarPlus, Columns3, CalendarRange } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { ActionButton } from "./action-button";
import { SegmentedControl } from "./segmented-control";
import { TooltipProvider } from "./tooltip";

/** Answers width media queries as a screen `width` px wide (jsdom has no layout). */
function setWidth(width: number) {
  vi.stubGlobal("matchMedia", (media: string) => {
    const max = /max-width:\s*(\d+)px/.exec(media);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}
afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: React.ReactElement) => render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

describe("ActionButton", () => {
  it("is named by its label at every width and shows a tooltip only once it is a glyph", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    setWidth(1280);
    const { unmount } = wrap(
      <ActionButton icon={<CalendarPlus />} label="New appointment" variant="primary" onClick={onClick} />,
    );
    await user.hover(screen.getByRole("button", { name: "New appointment" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New appointment" }));
    expect(onClick).toHaveBeenCalledOnce();
    unmount();

    setWidth(390);
    const { container } = wrap(<ActionButton icon={<CalendarPlus />} label="New appointment" />);
    const glyph = screen.getByRole("button", { name: "New appointment" });
    await user.hover(glyph);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("New appointment");
    await expectNoAxeViolations(container);
  });

  it("renders a link, in a new tab when asked", () => {
    setWidth(1280);
    wrap(
      <>
        <ActionButton icon={<CalendarPlus />} label="Open calendar" href="/dashboard/x/calendar" />
        <ActionButton icon={<CalendarPlus />} label="View site" href="/x" newTab />
      </>,
    );
    expect(screen.getByRole("link", { name: "Open calendar" })).toHaveAttribute(
      "href",
      "/dashboard/x/calendar",
    );
    expect(screen.getByRole("link", { name: "View site" })).toHaveAttribute("target", "_blank");
  });
});

describe("SegmentedControl collapseLabels", () => {
  it("keeps every option named (and switchable) when only its glyph shows", async () => {
    const user = userEvent.setup();
    function Views() {
      const [view, setView] = useState<"day" | "week">("day");
      return (
        <SegmentedControl
          aria-label="Calendar view"
          collapseLabels="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "day", label: "Day", icon: <Columns3 aria-hidden /> },
            { value: "week", label: "Week", icon: <CalendarRange aria-hidden /> },
          ]}
        />
      );
    }
    const { container } = wrap(<Views />);
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Day")).toHaveClass("max-sm:sr-only");
    await expectNoAxeViolations(container);
  });
});
