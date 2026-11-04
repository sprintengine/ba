"use client";

import { useRef } from "react";
import { AlertDialog as AD } from "radix-ui";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { overlayStyles } from "./dialog";

type ConfirmDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (optional when controlled). */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Theme for the dialog, which renders in a portal outside the page's themed wrapper: e.g. a business's colours and
   * fonts (`shellThemeProps`). Its `className` and `style` are added to the dialog's own.
   */
  themeProps?: React.HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  loading?: boolean;
  /** Return a promise to keep the dialog open (with a spinner) until it settles. */
  onConfirm: () => void | Promise<void>;
};

/** Confirmation for consequential actions (cancel booking, remove member, erase customer…). */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  themeProps,
}: ConfirmDialogProps) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <AD.Trigger asChild>{trigger}</AD.Trigger>}
      <AD.Portal>
        {/* AlertDialog's own overlay: Dialog.Overlay can't render outside a Dialog root. */}
        <AD.Overlay className={overlayStyles} />
        <AD.Content
          {...themeProps}
          // Radix returns focus only to an `AD.Trigger`: a confirmation opened from code gives it back to
          // whatever had it when it opened (still focused at this point), instead of dropping it on the page.
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
          }}
          onCloseAutoFocus={(event) => {
            if (trigger || !opener.current?.isConnected) return;
            event.preventDefault();
            opener.current.focus();
          }}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-raised p-6 shadow-xl outline-none",
            "animate-dialog-in data-[state=closed]:animate-dialog-out",
            themeProps?.className,
          )}
        >
          <AD.Title className="text-lg font-semibold tracking-tight">{title}</AD.Title>
          {description && (
            <AD.Description className="mt-1.5 text-sm text-muted-foreground">{description}</AD.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AD.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AD.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={loading}
              onClick={async (e) => {
                e.preventDefault();
                await onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
