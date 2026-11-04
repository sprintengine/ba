import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./field";
import { NumberInput, type NumberInputMode } from "./number-input";

/** A controlled NumberInput, as forms use it: the reported value flows back in. */
function Controlled({
  initial = null,
  onValue,
  mode,
  min,
  max,
  unit,
}: {
  initial?: number | null;
  onValue: (value: number | null) => void;
  mode?: NumberInputMode;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <Field label="Amount">
      <NumberInput
        mode={mode}
        min={min}
        max={max}
        unit={unit}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
    </Field>
  );
}

const box = () => screen.getByRole("textbox", { name: "Amount" });

describe("NumberInput, integer mode (default)", () => {
  it("is a labelled text box with the numeric keypad and the unit as a suffix", () => {
    render(<Controlled initial={30} unit="min" onValue={vi.fn()} />);
    expect(box()).toHaveAttribute("inputmode", "numeric");
    expect(box()).toHaveAttribute("autocomplete", "off");
    expect(box()).toHaveValue("30");
    expect(screen.getByText("min")).toBeInTheDocument();
  });

  it("takes typed digits and drops every other key", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await user.type(box(), "1a2.-3");
    expect(box()).toHaveValue("123");
    expect(onValue).toHaveBeenLastCalledWith(123);
    expect(onValue).not.toHaveBeenCalledWith(Number.NaN);
  });

  it("reports an emptied field as null", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled initial={45} onValue={onValue} />);
    await user.type(box(), "{Backspace}");
    expect(onValue).toHaveBeenLastCalledWith(4);
    await user.type(box(), "{Backspace}");
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(box()).toHaveValue("");
  });

  it("keeps only the digits of pasted text", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await user.click(box());
    await user.paste("1,250 kg");
    expect(box()).toHaveValue("1250");
    expect(onValue).toHaveBeenLastCalledWith(1250);
  });

  it("caps a huge number so it stays a safe integer", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.change(box(), { target: { value: "99999999999999999999" } });
    expect(onValue).toHaveBeenLastCalledWith(1_000_000_000);
  });

  it("clamps to min and max when it loses focus", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <NumberInput aria-label="Capacity" value={0} min={1} max={10} onValueChange={onValueChange} />,
    );
    fireEvent.blur(screen.getByLabelText("Capacity"));
    expect(onValueChange).toHaveBeenLastCalledWith(1);
    rerender(<NumberInput aria-label="Capacity" value={50} min={1} max={10} onValueChange={onValueChange} />);
    fireEvent.blur(screen.getByLabelText("Capacity"));
    expect(onValueChange).toHaveBeenLastCalledWith(10);
    expect(screen.getByLabelText("Capacity")).toHaveValue("50");
  });

  it("clamps when the user tabs away", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled min={2} max={8} onValue={onValue} />);
    await user.type(box(), "12");
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(8);
    expect(box()).toHaveValue("8");
    expect(box()).not.toHaveFocus();
  });

  it("passes Field's error wiring through to the input", () => {
    render(
      <Field label="Seats" error="At least 1">
        <NumberInput value={0} onValueChange={vi.fn()} />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Seats" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/At least 1/);
  });
});

describe("NumberInput, decimal mode", () => {
  it("offers the decimal keypad", () => {
    render(<Controlled mode="decimal" initial={1.5} onValue={vi.fn()} />);
    expect(box()).toHaveAttribute("inputmode", "decimal");
    expect(box()).toHaveValue("1.5");
  });

  it("takes decimals with a point or a comma", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled mode="decimal" onValue={onValue} />);
    await user.type(box(), "12.5");
    expect(onValue).toHaveBeenLastCalledWith(12.5);
    await user.clear(box());
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.type(box(), "3,75");
    expect(box()).toHaveValue("3,75");
    expect(onValue).toHaveBeenLastCalledWith(3.75);
  });

  it("rejects letters, a second separator and a minus after the first digit", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled mode="decimal" onValue={onValue} />);
    await user.type(box(), "1x.2.3-");
    expect(box()).toHaveValue("1.23");
    expect(onValue).toHaveBeenLastCalledWith(1.23);
    expect(onValue).not.toHaveBeenCalledWith(Number.NaN);
  });

  it("takes a leading minus and keeps the last value while the draft isn't a number yet", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled mode="decimal" initial={7} onValue={onValue} />);
    await user.clear(box());
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.type(box(), "-");
    expect(box()).toHaveValue("-");
    expect(onValue).toHaveBeenCalledTimes(1);
    await user.type(box(), ".5");
    expect(onValue).toHaveBeenLastCalledWith(-0.5);
  });

  it("pastes a number out of surrounding text, and ignores a paste that isn't one number", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled mode="decimal" onValue={onValue} />);
    await user.click(box());
    await user.paste("€12.50");
    expect(box()).toHaveValue("12.50");
    expect(onValue).toHaveBeenLastCalledWith(12.5);
    await user.clear(box());
    await user.paste("1,234.50");
    expect(box()).toHaveValue("");
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("shows the number itself once the field loses focus, clamped to min", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled mode="decimal" min={1} onValue={onValue} />);
    await user.type(box(), "2,50");
    await user.tab();
    expect(box()).toHaveValue("2.5");
    await user.clear(box());
    await user.type(box(), "0,5");
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(1);
    expect(box()).toHaveValue("1");
  });

  it("shows NaN as an empty field", () => {
    render(<NumberInput mode="decimal" aria-label="Hours" value={Number.NaN} onValueChange={vi.fn()} />);
    expect(screen.getByLabelText("Hours")).toHaveValue("");
  });
});
