import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { SwatchGroup } from "./swatch-group";

const PALETTE = ["#0E7C70", "#1d4ed8", "#c2417a"];

function Harness({
  initial,
  onChange = () => {},
  includeValue = false,
}: {
  initial: string;
  onChange?: (hex: string) => void;
  includeValue?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SwatchGroup
      aria-label="Colour"
      value={value}
      onValueChange={(hex) => {
        setValue(hex);
        onChange(hex);
      }}
      swatches={PALETTE}
      includeValue={includeValue}
    />
  );
}

describe("SwatchGroup", () => {
  it("matches colours whatever their case, and reports the choice as lowercase hex; axe-clean", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness initial="#0e7c70" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "#0e7c70" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "#c2417a" }));
    expect(onChange).toHaveBeenLastCalledWith("#c2417a");
    expect(screen.getByRole("radio", { name: "#c2417a" })).toBeChecked();
    await expectNoAxeViolations(container);
  });

  it("is one tab stop, and the arrow keys move the choice (wrapping)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Harness initial="#1d4ed8" />
      </>,
    );
    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();
    expect(screen.getByRole("radio", { name: "#1d4ed8" })).toHaveFocus();
    // Radix moves focus a tick after the keydown and picks the colour if the arrow is still down, as a held key is.
    const arrow = async (key: "ArrowRight" | "ArrowLeft", expected: string) => {
      await user.keyboard(`{${key}>}`);
      await waitFor(() => expect(screen.getByRole("radio", { name: expected })).toHaveFocus());
      await user.keyboard(`{/${key}}`);
      expect(screen.getByRole("radio", { name: expected })).toBeChecked();
    };
    await arrow("ArrowRight", "#c2417a");
    await arrow("ArrowRight", "#0e7c70");
    await arrow("ArrowLeft", "#c2417a");
  });

  it("lists a value outside the swatches first when asked to", () => {
    const { unmount } = render(<Harness initial="#ABCDEF" includeValue />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "#abcdef",
      "#0e7c70",
      "#1d4ed8",
      "#c2417a",
    ]);
    expect(radios[0]).toBeChecked();
    unmount();

    render(<Harness initial="#abcdef" />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  });
});
