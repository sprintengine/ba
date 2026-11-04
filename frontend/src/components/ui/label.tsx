"use client";

import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-sm leading-5 font-medium text-foreground select-none group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
