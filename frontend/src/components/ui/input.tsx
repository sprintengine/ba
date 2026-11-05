"use client";

import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field";

/** Shared control chrome for inputs, textareas, select triggers, comboboxes. */
export const controlStyles = cn(
  "w-full min-w-0 rounded-lg border border-input bg-surface text-foreground shadow-xs transition-[border-color,box-shadow,background-color] duration-150",
  "placeholder:text-subtle-foreground",
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "dark:bg-surface-sunken",
);

/**
 * Control heights and type for inputs, select triggers, comboboxes and date pickers. On touch screens every size is
 * a 44px target with 16px text (smaller text makes iOS zoom into the field).
 */
export const controlSizes = {
  sm: "h-8 px-2.5 text-sm pointer-coarse:h-11 pointer-coarse:text-base",
  md: "h-9 px-3 text-base sm:text-sm pointer-coarse:h-11 pointer-coarse:text-base",
  lg: "h-11 px-3.5 text-base",
} as const;
const sizeStyles = controlSizes;

export type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: keyof typeof sizeStyles;
  /** Icon or text inside the left edge (e.g. <Search />, "€"). */
  leading?: React.ReactNode;
  /** Element inside the right edge (e.g. a unit, clear button). */
  trailing?: React.ReactNode;
  /** Sizes the box a `leading` or `trailing` element sits in, so the element stays beside the text. */
  wrapperClassName?: string;
};

export function Input({
  className,
  wrapperClassName,
  size = "md",
  leading,
  trailing,
  type = "text",
  ...rest
}: InputProps) {
  const props = useFieldControlProps(rest);
  const input = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlStyles,
        sizeStyles[size],
        leading && "pl-9",
        trailing && "pr-10",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className={cn("relative flex w-full items-center", wrapperClassName)}>
      {leading && (
        <span className="pointer-events-none absolute left-3 flex items-center text-sm text-subtle-foreground [&_svg]:size-4">
          {leading}
        </span>
      )}
      {input}
      {trailing && (
        <span className="absolute right-2 flex items-center text-sm text-subtle-foreground [&_svg]:size-4">
          {trailing}
        </span>
      )}
    </div>
  );
}
