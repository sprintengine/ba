"use client";

import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

/** Mobile bottom sheet with swipe-to-dismiss (vaul). */
export const Drawer = Vaul.Root;
export const DrawerTrigger = Vaul.Trigger;
export const DrawerClose = Vaul.Close;

export function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof Vaul.Content>) {
  return (
    <Vaul.Portal>
      <Vaul.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <Vaul.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border bg-surface-raised shadow-xl outline-none",
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
        {children}
      </Vaul.Content>
    </Vaul.Portal>
  );
}

export function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-2 pb-3", className)} {...props} />;
}
export function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", className)} {...props} />;
}
export function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border-subtle px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}
export function DrawerTitle({ className, ...props }: React.ComponentProps<typeof Vaul.Title>) {
  return <Vaul.Title className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}
export function DrawerDescription({ className, ...props }: React.ComponentProps<typeof Vaul.Description>) {
  return <Vaul.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
