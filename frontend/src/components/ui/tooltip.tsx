"use client";

import { createContext, useContext } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const InTooltipProvider = createContext(false);

/**
 * Shares one open/skip delay between the tooltips below it, so moving along a toolbar shows the next tooltip at
 * once. Mounted by the shells that are full of tooltips (the dashboard), not at the root: Radix's tooltip and
 * popper stay out of routes that never show one. A <Tooltip> outside any provider brings its own.
 */
export function TooltipProvider({
  delayDuration = 250,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <InTooltipProvider value>
      <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={150} {...props} />
    </InTooltipProvider>
  );
}

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-72 rounded-md bg-gray-925 px-2 py-1 text-xs font-medium text-gray-50 shadow-md dark:bg-gray-100 dark:text-gray-950",
          "origin-(--radix-tooltip-content-transform-origin) animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Optional keyboard shortcut shown after the label. */
  shortcut?: string;
  disabled?: boolean;
};

/** Simple tooltip: <Tooltip content="Edit"><button …/></Tooltip>. The child must accept a ref. */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  shortcut,
  disabled,
}: TooltipProps) {
  const provided = useContext(InTooltipProvider);
  if (disabled || !content) return <>{children}</>;
  const tooltip = (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align}>
        <span className="flex items-center gap-2">
          {content}
          {shortcut && <span className="text-gray-400 dark:text-gray-500">{shortcut}</span>}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}
