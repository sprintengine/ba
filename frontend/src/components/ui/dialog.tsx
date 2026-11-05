"use client";

import { createContext, useContext, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** What had focus when a controlled dialog opened (null when uncontrolled, or when nothing in particular had it). */
const ReturnFocusContext = createContext<HTMLElement | null>(null);

const focusedElement = () =>
  typeof document !== "undefined" &&
  document.activeElement instanceof HTMLElement &&
  document.activeElement !== document.body
    ? document.activeElement
    : null;

/** What had focus when `open` last turned true (null when uncontrolled, or when nothing in particular had it). */
export function useOpener(open: boolean | undefined): HTMLElement | null {
  const [opener, setOpener] = useState(() => (open ? focusedElement() : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(focusedElement());
  }
  return opener;
}

/**
 * Radix's Dialog root. Radix gives focus back to a `<DialogTrigger>` on close, so a dialog opened from code (an "Edit"
 * button that sets state) would drop it on the page; a controlled dialog instead returns focus to whatever had it when
 * it opened.
 */
export function Dialog({ open, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const opener = useOpener(open);
  return (
    <ReturnFocusContext.Provider value={opener}>
      <DialogPrimitive.Root open={open} {...props} />
    </ReturnFocusContext.Provider>
  );
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

/** Overlay styles, shared with AlertDialog-based ConfirmDialog. */
export const overlayStyles =
  "fixed inset-0 z-50 animate-fade-in bg-overlay backdrop-blur-[7px] data-[state=closed]:animate-fade-out";

export function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn(overlayStyles, className)} {...props} />;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

export function DialogContent({
  className,
  children,
  size = "md",
  hideClose = false,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: keyof typeof sizes;
  hideClose?: boolean;
}) {
  const opener = useContext(ReturnFocusContext);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-2xl border border-border bg-surface-raised shadow-xl outline-none",
          "animate-dialog-in data-[state=closed]:animate-dialog-out",
          sizes[size],
          // Phones: a bottom sheet, its actions within thumb reach and above the home indicator.
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented || !opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute top-3.5 right-3.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:top-2 pointer-coarse:right-2 pointer-coarse:size-11"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 px-6 pt-5 pr-12 pb-2 pointer-coarse:pr-14", className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-3", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border-subtle px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("text-lg font-semibold tracking-tight", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}
