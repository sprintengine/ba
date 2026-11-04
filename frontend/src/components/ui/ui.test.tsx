import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useVocabulary, VocabularyProvider } from "@/lib/vocabulary";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Field } from "./field";
import { Input } from "./input";
import { MoneyInput } from "./money-input";
import { BookingStatusBadge } from "./status-badge";
import { Table, TableBody, TableCell, TableRow } from "./table";
import { Tooltip, TooltipProvider } from "./tooltip";

describe("Button", () => {
  it("disables and marks busy while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: /save/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("has a low-emphasis destructive variant", () => {
    render(<Button variant="danger-ghost">Remove</Button>);
    const button = screen.getByRole("button", { name: "Remove" });
    expect(button).toHaveClass("text-danger-soft-foreground", "hover:bg-danger-soft");
    expect(button).not.toHaveClass("bg-danger");
  });
});

describe("TableRow", () => {
  const renderRow = (onActivate: () => void) =>
    render(
      <Table>
        <TableBody>
          <TableRow onActivate={onActivate} aria-label="Open Alex">
            <TableCell>Alex</TableCell>
            <TableCell>
              <button type="button">Inner</button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

  it("with onActivate, is reachable with Tab and opens on click, Enter or Space", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    renderRow(onActivate);
    const row = screen.getByRole("row", { name: "Open Alex" });
    await user.tab();
    expect(row).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(screen.getByText("Alex"));
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it("leaves keys on a control inside the row to that control", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    renderRow(onActivate);
    screen.getByRole("button", { name: "Inner" }).focus();
    await user.keyboard("{Enter}");
    // The inner button's own click bubbles to the row; the key itself is not handled twice.
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("without onActivate, is a plain row", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Plain</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("row")).not.toHaveAttribute("tabindex");
  });
});

describe("Field", () => {
  it("wires label, help and error to the control", () => {
    render(
      <Field label="Email" help="We send confirmations here." error="Enter a valid email" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(/We send confirmations here\. Enter a valid email/);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
  });
});

describe("Calendar", () => {
  it("supports keyboard navigation and selection on plain dates", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<string | null>("2026-10-14");
      return (
        <Calendar
          value={value}
          onValueChange={(d) => {
            setValue(d);
            onChange(d);
          }}
          isDateDisabled={(d) => d === "2026-10-16"}
          timeZone="Europe/Dublin"
        />
      );
    }
    render(<Harness />);
    const selected = screen.getByRole("button", { name: /14 October 2026/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    selected.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /15 October 2026/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /22 October 2026/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-22");
    expect(screen.getByRole("button", { name: /16 October 2026/ })).toBeDisabled();
    await userEvent.keyboard("{PageDown}");
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /22 November 2026/ })).toHaveFocus();
  });
});

describe("MoneyInput", () => {
  it("emits integer cents", () => {
    const onValueChange = vi.fn();
    render(<MoneyInput aria-label="Price" currency="EUR" value={null} onValueChange={onValueChange} />);
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "45,50" } });
    expect(onValueChange).toHaveBeenLastCalledWith(4550);
  });
  it("flags negative input as invalid and does not emit it", () => {
    const onValueChange = vi.fn();
    render(<MoneyInput aria-label="Price" currency="EUR" value={null} onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Price");
    fireEvent.change(input, { target: { value: "-5" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "5" } });
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(onValueChange).toHaveBeenLastCalledWith(500);
  });
});

describe("Tooltip", () => {
  it("works without a TooltipProvider above it", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Edit" shortcut="E">
        <button type="button">Pencil</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole("button", { name: "Pencil" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Edit");
  });
  it("shares the provider it is mounted under", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Delete">
          <button type="button">Bin</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole("button", { name: "Bin" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Delete");
  });
});

describe("vocabulary", () => {
  function Words() {
    const { v } = useVocabulary();
    return <p>{`${v("customers", { title: true })} ${v("booking", { count: 2 })} ${v("resource")}`}</p>;
  }
  it("uses business nouns with defaults", () => {
    render(
      <VocabularyProvider
        vocabulary={{
          resource: "therapist",
          resources: "therapists",
          customer: "patient",
          customers: "patients",
          booking: "appointment",
          bookings: "appointments",
        }}
      >
        <Words />
      </VocabularyProvider>,
    );
    expect(screen.getByText("Patients appointments therapist")).toBeInTheDocument();
  });
});

describe("BookingStatusBadge", () => {
  it("renders human labels", () => {
    render(<BookingStatusBadge status="pending_approval" />);
    expect(screen.getByText("Needs approval")).toBeInTheDocument();
  });
});
