/** The UI kit's accessibility contract: axe-clean markup, accessible names, and the keyboard behaviour Radix gives us. */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "lucide-react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { ApiError } from "@/lib/api/client";
import { expectNoAxeViolations } from "@/test/axe";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { ConfirmDialog } from "./confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Field } from "./field";
import { applyApiErrors, Form, FormField, FormRootError, FormSubmit } from "./form";
import { IconButton } from "./icon-button";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Textarea } from "./textarea";
import { TooltipProvider } from "./tooltip";

describe("expectNoAxeViolations", () => {
  it("fails naming the rule and the node", async () => {
    const { container } = render(
      <button type="button">
        <svg />
      </button>,
    );
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/button-name \(critical\)/);
  });
});

describe("Button and IconButton", () => {
  it("are axe-clean and named; an icon button is named by its label", async () => {
    const { container } = render(
      <TooltipProvider>
        <Button variant="primary">Save</Button>
        <Button loading>Saving</Button>
        <IconButton label="Settings">
          <Settings />
        </IconButton>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("Field", () => {
  it("is axe-clean with help, error and an optional hint", async () => {
    const { container } = render(
      <>
        <Field label="Name" help="As it appears on the receipt" error="Enter a name" required>
          <Input />
        </Field>
        <Field label="Notes" optional>
          <Textarea />
        </Field>
      </>,
    );
    expect(screen.getByRole("textbox", { name: /notes/i })).toHaveAccessibleName(/^Notes ?\(optional\)$/);
    await expectNoAxeViolations(container);
  });
});

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  email: z.string().trim().min(1, "Enter an email"),
});
type Values = z.infer<typeof schema>;

function DemoForm({ onSubmit }: { onSubmit: (values: Values) => Promise<void> }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "" } });
  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        try {
          await onSubmit(values);
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <FormField name="name" label="Name" required>
        {(field) => <Input {...field} />}
      </FormField>
      <FormField name="email" label="Email" required>
        {(field) => <Input type="email" {...field} />}
      </FormField>
      <FormRootError />
      <FormSubmit>Save</FormSubmit>
    </Form>
  );
}

const invalid = (fields: Record<string, string>, message = "Check the highlighted fields.") =>
  new ApiError(400, "INVALID_REQUEST", message, fields);

describe("Form", () => {
  it("shows client validation errors on the fields, described and marked invalid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    const { container } = render(<DemoForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByRole("textbox", { name: /name/i });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a name");
    expect(name).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("maps server field errors onto the fields and focuses the first", async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw invalid({ email: "Must be a valid email address" });
        }}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: /name/i }), "Avery");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "avery@");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const email = await screen.findByRole("textbox", { name: /email/i, description: /valid email/ });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /name/i })).not.toHaveAttribute("aria-invalid");
    // A field error is enough: the generic message is not repeated at the top.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("puts errors for unknown fields, and other API errors, at the top of the form", async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw invalid({ "policies.holdMinutes": "Too long" }, "That doesn't look right.");
        }}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: /name/i }), "Avery");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "avery@example.test");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That doesn't look right.");
  });

  it("shows a generic message for errors that are not API errors", async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw new TypeError("network");
        }}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: /name/i }), "Avery");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "avery@example.test");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});

describe("Dialog", () => {
  function Demo() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>Edit hours</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opening hours</DialogTitle>
            <DialogDescription>When customers can book.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Opens">
              <Input />
            </Field>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  it("is a named, axe-clean modal that traps focus and closes on Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Edit hours" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Opening hours" });
    expect(dialog).toHaveAccessibleDescription("When customers can book.");
    await expectNoAxeViolations(document.body);

    // Focus starts inside and Tab cycles within the dialog (input → close → input).
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe("ConfirmDialog", () => {
  it("is an axe-clean alert dialog that waits for an async confirm", async () => {
    const user = userEvent.setup();
    let finish = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    function Demo() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Cancel this booking?"
          description="The customer is told by email."
          confirmLabel="Cancel booking"
          cancelLabel="Keep it"
          destructive
          onConfirm={async () => {
            await onConfirm();
            setOpen(false);
          }}
        />
      );
    }
    render(<Demo />);
    expect(screen.getByRole("alertdialog", { name: "Cancel this booking?" })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

describe("Select", () => {
  it("opens from the keyboard, moves with arrows and selects with Enter", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <Field label="Currency">
        <Select defaultValue="EUR" onValueChange={onValueChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EUR">Euro</SelectItem>
            <SelectItem value="GBP">Pound sterling</SelectItem>
          </SelectContent>
        </Select>
      </Field>,
    );
    const trigger = screen.getByRole("combobox", { name: "Currency" });
    await expectNoAxeViolations(container);

    trigger.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("GBP");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(trigger).toHaveTextContent("Pound sterling");
  });
});

describe("Tabs", () => {
  it("is axe-clean and moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Tabs defaultValue="upcoming">
        <TabsList aria-label="Bookings">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">Nothing booked</TabsContent>
        <TabsContent value="past">No history</TabsContent>
      </Tabs>,
    );
    await expectNoAxeViolations(container);
    await user.tab();
    expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    const past = screen.getByRole("tab", { name: "Past" });
    expect(past).toHaveFocus();
    expect(past).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Past" })).toHaveTextContent("No history");
  });
});

describe("Calendar", () => {
  it("is axe-clean", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    try {
      const { container } = render(
        <Calendar
          value="2026-10-14"
          onValueChange={() => {}}
          timeZone="Europe/Dublin"
          hasMarker={(d) => d === "2026-10-20"}
        />,
      );
      await expectNoAxeViolations(container);
    } finally {
      vi.useRealTimers();
    }
  });
});
