"use client";

import { Command as Cmdk } from "cmdk";
import { Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { DialogOverlay } from "./dialog";

/** cmdk primitives, styled. Used by <Combobox> and <CommandMenu>. */
export function Command({ className, ...props }: React.ComponentProps<typeof Cmdk>) {
  return (
    <Cmdk className={cn("flex size-full flex-col overflow-hidden text-foreground", className)} {...props} />
  );
}

/** The palette's search field; `trailing` sits at its right end (e.g. a dictation microphone). */
export function CommandInput({
  className,
  trailing,
  ...props
}: React.ComponentProps<typeof Cmdk.Input> & { trailing?: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border px-3 has-[[data-trailing]]:pr-1.5"
      cmdk-input-wrapper=""
    >
      <Search className="size-4 shrink-0 text-subtle-foreground" />
      <Cmdk.Input
        className={cn(
          "flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground disabled:opacity-50 pointer-coarse:text-base",
          className,
        )}
        {...props}
      />
      {trailing && (
        <span data-trailing="" className="flex shrink-0 items-center">
          {trailing}
        </span>
      )}
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof Cmdk.List>) {
  return (
    <Cmdk.List
      className={cn("max-h-80 scroll-py-1 scrollbar-thin overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: React.ComponentProps<typeof Cmdk.Empty>) {
  return (
    <Cmdk.Empty className={cn("py-8 text-center text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof Cmdk.Group>) {
  return (
    <Cmdk.Group
      className={cn(
        "overflow-hidden p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A visual divider between groups. Hidden from assistive tech: a listbox may own only options and groups. */
export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof Cmdk.Separator>) {
  return <Cmdk.Separator aria-hidden className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof Cmdk.Item>) {
  return (
    <Cmdk.Item
      className={cn(
        "relative flex h-9 cursor-default items-center gap-2.5 rounded-md px-2 text-sm outline-none select-none pointer-coarse:h-11",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn("ml-auto text-xs tracking-wide text-subtle-foreground", className)} {...props} />
  );
}

/** Command palette in a dialog (⌘K). */
export function CommandDialog({
  open,
  onOpenChange,
  children,
  label = "Command menu",
  filter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  label?: string;
  filter?: React.ComponentProps<typeof Cmdk>["filter"];
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl outline-none",
            // Phones: pinned to the top, the list sized to stay clear of the on-screen keyboard.
            "max-sm:top-[max(0.5rem,env(safe-area-inset-top))] max-sm:w-[calc(100vw-1rem)] max-sm:[&_[cmdk-list]]:max-h-[45dvh]",
            // The list fades out at its foot, so a row cut by the edge reads as more to scroll, not as broken.
            "[&_[cmdk-list]]:[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] [&_[cmdk-list]]:pb-6",
            "animate-pop-in data-[state=closed]:animate-pop-out",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <Command label={label} filter={filter} loop>
            {children}
          </Command>
          <DialogPrimitive.Close
            aria-label="Close search"
            className="absolute top-0.5 right-0.5 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
          >
            <X aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
