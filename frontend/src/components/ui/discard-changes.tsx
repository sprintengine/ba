"use client";

import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Asks "Discard changes?" before a dialog or sheet with unsaved edits closes (Escape, the overlay, the close button
 * or Cancel). Pass the dialog the returned `onOpenChange` and render `confirm` inside it; close it with the original
 * `onOpenChange` once its changes are saved.
 *
 *   const discard = useDiscardChanges(form.formState.isDirty, onOpenChange);
 *   <Dialog open={open} onOpenChange={discard.onOpenChange}> … {discard.confirm} </Dialog>
 */
export function useDiscardChanges(dirty: boolean, onOpenChange: (open: boolean) => void) {
  const [asking, setAsking] = useState(false);
  const guarded = (open: boolean) => {
    if (!open && dirty) setAsking(true);
    else onOpenChange(open);
  };
  const confirm = (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      title="Discard changes?"
      description="What you changed here hasn't been saved."
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      destructive
      onConfirm={() => {
        setAsking(false);
        onOpenChange(false);
      }}
    />
  );
  return { onOpenChange: guarded, confirm };
}
