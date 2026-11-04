"use client";

import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field";
import { controlStyles } from "./input";

/** Multi-line input. Grows with content (CSS field-sizing) between `minRows` and max-h-80. */
export function Textarea({ className, rows = 3, ...rest }: React.ComponentProps<"textarea">) {
  const props = useFieldControlProps(rest);
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        controlStyles,
        "field-sizing-content max-h-80 min-h-20 px-3 py-2 text-base leading-6 sm:text-sm pointer-coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}
