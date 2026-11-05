"use client";

import { useState } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useOpener,
} from "./dialog";
import { useDiscardChanges } from "./discard-changes";
import { Form, FormSubmit } from "./form";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "./sheet";

/**
 * Editor dialogs and sheets: a react-hook-form form with a title, a body, Cancel and a submit button. What every one
 * of them needs is built in:
 *  - closing with unsaved edits (Escape, the overlay, the close button, Cancel) asks "Discard changes?" first, and
 *    leaving the page asks too (useUnsavedChangesGuard); discarding resets the form;
 *  - it can't be closed while the form is submitting;
 *  - focus goes back to `returnFocusTo`, else to whatever had focus when it opened.
 * A successful save closes it by calling the caller's own `onOpenChange(false)`, which skips the questions.
 *
 *   <FormDialog open={open} onOpenChange={setOpen} form={form} onSubmit={save} title="New group" submitLabel="Add">
 *     <FormField …/>
 *   </FormDialog>
 */
type FormShellProps<V extends FieldValues> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<V>;
  onSubmit: SubmitHandler<V>;
  title: React.ReactNode;
  description?: React.ReactNode;
  submitLabel: React.ReactNode;
  cancelLabel?: string;
  submitDisabled?: boolean;
  /** At the footer's start, e.g. a Delete button. */
  footerStart?: React.ReactNode;
  /** Where focus goes on close; by default whatever had focus when it opened. */
  returnFocusTo?: HTMLElement | null;
  children: React.ReactNode;
};

/** The close handling shared by FormDialog and FormSheet. */
function useFormShell<V extends FieldValues>({
  open,
  onOpenChange,
  form,
  returnFocusTo,
}: Pick<FormShellProps<V>, "open" | "onOpenChange" | "form" | "returnFocusTo">) {
  const dirty = form.formState.isDirty;
  useUnsavedChangesGuard(open && dirty);
  const discard = useDiscardChanges(dirty, (o) => {
    // Closing (unchanged, or after "Discard") leaves the form as it was opened, for a dialog that stays mounted.
    if (!o) form.reset();
    onOpenChange(o);
  });
  const submitting = form.formState.isSubmitting;
  const requestOpenChange = (o: boolean) => {
    if (!o && submitting) return;
    discard.onOpenChange(o);
  };
  const opener = useOpener(open);
  const onCloseAutoFocus = (event: Event) => {
    const target = returnFocusTo ?? opener;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus();
  };
  return { requestOpenChange, confirm: discard.confirm, onCloseAutoFocus };
}

export function FormDialog<V extends FieldValues>({
  size = "md",
  bodyClassName,
  ...props
}: FormShellProps<V> & { size?: "sm" | "md" | "lg" | "xl"; bodyClassName?: string }) {
  const { open, form, onSubmit, title, description, children } = props;
  const shell = useFormShell(props);
  return (
    <Dialog open={open} onOpenChange={shell.requestOpenChange}>
      <DialogContent size={size} onCloseAutoFocus={shell.onCloseAutoFocus}>
        {shell.confirm}
        <Form form={form} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-0">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody className={cn("flex flex-col gap-5", bodyClassName)}>{children}</DialogBody>
          <DialogFooter
            className={cn(props.footerStart !== undefined && "max-sm:flex-col-reverse sm:justify-between")}
          >
            <FormActions {...props} onCancel={() => shell.requestOpenChange(false)} />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A FormDialog as a side sheet, for long editors. `children` fill the space between the header and the footer
 * (scrolling is theirs, so they can lay out a form beside a preview).
 */
export function FormSheet<V extends FieldValues>({
  size = "md",
  className,
  ...props
}: FormShellProps<V> & { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const { open, form, onSubmit, title, description, children } = props;
  const shell = useFormShell(props);
  return (
    <Sheet open={open} onOpenChange={shell.requestOpenChange}>
      <SheetContent size={size} className={className} onCloseAutoFocus={shell.onCloseAutoFocus}>
        {shell.confirm}
        <Form form={form} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-0">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          {children}
          <SheetFooter
            className={cn(
              "items-center",
              // Phones: the actions on top, footerStart (often Delete) under them, as in DialogFooter. Stacked, a
              // button must not flex (SheetFooter's row default): flex-1 in a column shrinks it to its text height.
              props.footerStart !== undefined &&
                "max-sm:flex-col-reverse max-sm:items-stretch sm:justify-between max-sm:[&>a]:flex-none max-sm:[&>button]:flex-none",
            )}
          >
            <FormActions {...props} onCancel={() => shell.requestOpenChange(false)} />
          </SheetFooter>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

function FormActions<V extends FieldValues>({
  footerStart,
  cancelLabel = "Cancel",
  submitLabel,
  submitDisabled,
  onCancel,
}: FormShellProps<V> & { onCancel: () => void }) {
  const buttons = (
    <>
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <FormSubmit disabled={submitDisabled}>{submitLabel}</FormSubmit>
    </>
  );
  if (footerStart === undefined) return buttons;
  return (
    <>
      {footerStart ?? <span />}
      {/* Phones: Cancel and Save share the width, like the stacked buttons of a dialog without footerStart. */}
      <div className="grid grid-cols-2 gap-2 sm:flex">{buttons}</div>
    </>
  );
}

let editorKey = 0;

/**
 * Which item an editor dialog or sheet is open for: `open(item)` (null for a new one) mounts it fresh (`key`) with
 * focus to return to the control that opened it; closing unmounts it.
 *
 *   const editor = useEditorDialog<Group>();
 *   <Button onClick={() => editor.open(null)}>New group</Button>
 *   {editor.current && <GroupDialog key={editor.current.key} group={editor.current.item} {...editor.dialogProps} />}
 */
export function useEditorDialog<T>() {
  const [current, setCurrent] = useState<{ item: T | null; key: number; opener: HTMLElement | null } | null>(
    null,
  );
  const open = (item: T | null = null) =>
    setCurrent({
      item,
      key: ++editorKey,
      opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  const close = () => setCurrent(null);
  return {
    current,
    open,
    close,
    /** For the editor: open, closing unmounts it, and where focus goes back to. */
    dialogProps: {
      open: true,
      onOpenChange: (o: boolean) => {
        if (!o) close();
      },
      returnFocusTo: current?.opener ?? null,
    },
  };
}
