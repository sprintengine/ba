"use client";

import { ScrollArea as ScrollPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  viewportClassName,
  ...props
}: React.ComponentProps<typeof ScrollPrimitive.Root> & {
  orientation?: "vertical" | "horizontal" | "both";
  viewportClassName?: string;
}) {
  return (
    <ScrollPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}>
      <ScrollPrimitive.Viewport className={cn("size-full rounded-[inherit]", viewportClassName)}>
        {children}
      </ScrollPrimitive.Viewport>
      {(orientation === "vertical" || orientation === "both") && <ScrollBar orientation="vertical" />}
      {(orientation === "horizontal" || orientation === "both") && <ScrollBar orientation="horizontal" />}
      <ScrollPrimitive.Corner />
    </ScrollPrimitive.Root>
  );
}

function ScrollBar({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <ScrollPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 transition-opacity select-none data-[state=hidden]:opacity-0",
        orientation === "vertical" ? "h-full w-2.5" : "h-2.5 flex-col",
      )}
    >
      <ScrollPrimitive.Thumb className="relative flex-1 rounded-full bg-border-strong hover:bg-subtle-foreground/50" />
    </ScrollPrimitive.Scrollbar>
  );
}
