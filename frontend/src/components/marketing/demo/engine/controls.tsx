"use client";

import { controlStyles } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DemoCaret, useDemoTarget } from "./demo-context";

/** The focus ring a real control shows while it has focus (`focus-visible` can't fire in the inert replica). */
export const FOCUSED = "border-ring ring-3 ring-ring/20";

/**
 * What's typed so far, then the caret while focused; the placeholder until something is typed (as a real field
 * shows it while focused and empty). The container decides how the text wraps.
 */
export function Typed({
  value,
  placeholder,
  focused,
  caretClassName,
}: {
  value: string;
  placeholder?: string;
  focused: boolean;
  caretClassName?: string;
}) {
  return (
    <>
      {value}
      {focused && <DemoCaret className={caretClassName} />}
      {!value && placeholder && <span className="text-subtle-foreground">{placeholder}</span>}
    </>
  );
}

const SIZES = {
  /** The dashboard's compact inputs. */
  sm: "h-8 px-2.5 text-sm",
  md: "h-9 px-3 text-sm",
  /** `<Input size="lg">`, as the booking flow draws it on a phone. */
  lg: "h-11 px-3.5 text-base leading-[normal]",
};

/** A replica text input (the real control's chrome) that shows typed text, a caret and the focus ring. */
export function DemoInput({
  id,
  value,
  placeholder,
  leading,
  trailing,
  size = "md",
  className,
}: {
  id: string;
  value: string;
  placeholder?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = useDemoTarget(id);
  return (
    <div
      {...t.props}
      className={cn(controlStyles, "flex items-center", SIZES[size], t.focused && FOCUSED, className)}
    >
      {leading && <span className="mr-2 flex text-subtle-foreground [&_svg]:size-4">{leading}</span>}
      <span className="min-w-0 flex-1 truncate whitespace-pre">
        <Typed
          value={value}
          placeholder={placeholder}
          focused={t.focused}
          caretClassName={size === "lg" ? "h-[1.2em]" : undefined}
        />
      </span>
      {trailing && <span className="ml-2 text-subtle-foreground">{trailing}</span>}
    </div>
  );
}
