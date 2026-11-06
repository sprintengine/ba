"use client";

import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogOverlay } from "./dialog";

/**
 * Side panel (booking details, filters, mobile nav). Built on Radix Dialog.
 * For bottom sheets on mobile prefer <Drawer> (vaul) — it supports swipe-to-close.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

/** The panel's own surface, and its title's type, for a sample of it drawn without a dialog. */
export const SHEET_SURFACE = "flex flex-col bg-surface-raised shadow-xl";
export const SHEET_TITLE = "text-base font-semibold tracking-tight";

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-3xl" } as const;

export function SheetContent({
  className,
  children,
  side = "right",
  size = "md",
  hideClose,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "left" | "right";
  size?: keyof typeof widths;
  hideClose?: boolean;
}) {
  return (
    <SheetPrimitive.Portal>
      <DialogOverlay />
      <SheetPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 w-full outline-none",
          SHEET_SURFACE,
          side === "right"
            ? "right-0 animate-sheet-in-right border-l border-border data-[state=closed]:animate-sheet-out-right"
            : "left-0 animate-sheet-in-left border-r border-border data-[state=closed]:animate-sheet-out-left",
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            className="absolute top-3.5 right-3.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:top-2 pointer-coarse:right-2 pointer-coarse:size-11"
            aria-label="Close"
          >
            <X className="size-4" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border-subtle px-5 py-4 pr-12 pointer-coarse:pr-14",
        className,
      )}
      {...props}
    />
  );
}
export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}
export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Phones: buttons share the width instead of huddling at the start.
        "flex gap-2 border-t border-border-subtle px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:justify-end max-sm:[&>a]:flex-1 max-sm:[&>button]:flex-1",
        className,
      )}
      {...props}
    />
  );
}
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn(SHEET_TITLE, className)} {...props} />;
}
export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
