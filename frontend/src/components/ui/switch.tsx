"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field";
import { touchHitArea } from "./touch";

export function Switch({
  className,
  size = "md",
  ...rest
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "md" }) {
  const props = useFieldControlProps(rest);
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex shrink-0 items-center rounded-full border border-transparent bg-input p-0.5 transition-colors duration-200",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        size === "md" ? "h-5.5 w-9.5" : "h-4.5 w-7.5",
        touchHitArea,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-[var(--ease-spring)] data-[state=unchecked]:translate-x-0",
          "dark:data-[state=checked]:bg-primary-foreground",
          size === "md"
            ? "size-4.5 data-[state=checked]:translate-x-4"
            : "size-3.5 data-[state=checked]:translate-x-3",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
