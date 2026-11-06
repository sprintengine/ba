"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Tabs. `variant="underline"` (default, page-level sections) or `"pill"` (compact, in cards).
 * For URL-driven tabs, render <TabsList> with <TabsTrigger asChild><Link …/></TabsTrigger>.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: "underline" | "pill" }) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        "group/tabs flex scrollbar-none items-center overflow-x-auto",
        variant === "underline" && "gap-5 border-b border-border",
        variant === "pill" && "inline-flex h-9 gap-0.5 rounded-lg bg-muted p-0.5 pointer-coarse:h-11",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  onPointerDown,
  onBlur,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      // The roving focus marks a clicked tab as :focus-visible too, so the ring would look like the selected state.
      // Reached by pointer it stays off; arrowing to a tab still shows it.
      onPointerDown={(e) => {
        e.currentTarget.dataset.pointer = "";
        onPointerDown?.(e);
      }}
      onBlur={(e) => {
        delete e.currentTarget.dataset.pointer;
        onBlur?.(e);
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none pointer-coarse:min-w-11",
        "rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 data-pointer:focus-visible:ring-0 [&_svg]:size-4",
        // underline
        "group-data-[variant=underline]/tabs:relative group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:h-10 group-data-[variant=underline]/tabs:rounded-none group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:px-1 pointer-coarse:group-data-[variant=underline]/tabs:h-11",
        "group-data-[variant=underline]/tabs:data-[state=active]:border-foreground group-data-[variant=underline]/tabs:data-[state=active]:text-foreground",
        // pill
        "group-data-[variant=pill]/tabs:h-8 group-data-[variant=pill]/tabs:rounded-md group-data-[variant=pill]/tabs:px-3 pointer-coarse:group-data-[variant=pill]/tabs:h-10",
        "group-data-[variant=pill]/tabs:data-[state=active]:bg-surface group-data-[variant=pill]/tabs:data-[state=active]:text-foreground group-data-[variant=pill]/tabs:data-[state=active]:shadow-sm dark:group-data-[variant=pill]/tabs:data-[state=active]:bg-border-strong",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("pt-5 outline-none data-[state=active]:animate-fade-in", className)}
      {...props}
    />
  );
}
