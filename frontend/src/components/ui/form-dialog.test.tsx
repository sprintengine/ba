/** FormDialog/FormSheet: the close handling every editor shares, and useEditorDialog. */
import { useForm } from "react-hook-form";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { FormField } from "./form";
import { FormDialog, FormSheet, useEditorDialog } from "./form-dialog";
import { Input } from "./input";

type V = { name: string };

function Editor({
  onSave,
  sheet = false,
  open = true,
  onOpenChange = () => {},
  returnFocusTo,
}: {
  onSave: (v: V) => Promise<void>;
  sheet?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const form = useForm<V>({ defaultValues: { name: "Members" } });
  const Shell = sheet ? FormSheet : FormDialog;
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      title="Edit group"
      description="Rename it."
      submitLabel="Save"
      onSubmit={async (v) => {
        await onSave(v);
        onOpenChange(false);
      }}
    >
      <FormField<V, "name"> name="name" label="Name">
        {(field) => <Input {...field} />}
      </FormField>
    </Shell>
  );
}

describe.each([false, true])("FormDialog/FormSheet (sheet: %s)", (sheet) => {
  it("closes straight away without edits", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Editor sheet={sheet} onSave={vi.fn()} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks before discarding edits, and keeps them on Keep editing", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Editor sheet={sheet} onSave={vi.fn()} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Name"), " club");
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Members club");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Discarding leaves the form as it was opened (for an editor that stays mounted).
    expect(screen.getByLabelText("Name")).toHaveValue("Members");
  });

  it("can't be closed while saving; a save closes it without asking", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Editor sheet={sheet} onSave={onSave} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Name"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: "Members!" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

function EditorList() {
  const editor = useEditorDialog<string>();
  return (
    <>
      {["Members", "Students"].map((name) => (
        <Button key={name} onClick={() => editor.open(name)}>
          Edit {name}
        </Button>
      ))}
      {editor.current && (
        <ItemEditor key={editor.current.key} item={editor.current.item} {...editor.dialogProps} />
      )}
    </>
  );
}

function ItemEditor({
  item,
  ...props
}: {
  item: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: HTMLElement | null;
}) {
  const form = useForm<V>({ defaultValues: { name: item ?? "" } });
  return (
    <FormSheet {...props} form={form} title={`Edit ${item}`} submitLabel="Save" onSubmit={() => {}}>
      <FormField<V, "name"> name="name" label="Name">
        {(field) => <Input {...field} />}
      </FormField>
    </FormSheet>
  );
}

describe("useEditorDialog", () => {
  it("opens a fresh editor for the item and gives focus back to its opener on close", async () => {
    const user = userEvent.setup();
    render(<EditorList />);
    await user.click(screen.getByRole("button", { name: "Edit Students" }));
    expect(await screen.findByRole("dialog", { name: "Edit Students" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Students");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Students" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Edit Members" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Members");
  });
});
