"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";
import { useMediaQuery } from "./use-media-query";

const QUERY = { sm: "(max-width: 639px)", md: "(max-width: 767px)", lg: "(max-width: 1023px)" } as const;
const LABEL = { sm: "max-sm:sr-only", md: "max-md:sr-only", lg: "max-lg:sr-only" } as const;
const SQUARE = {
  sm: "max-sm:aspect-square max-sm:px-0",
  md: "max-md:aspect-square max-md:px-0",
  lg: "max-lg:aspect-square max-lg:px-0",
} as const;

export type ActionButtonProps = Omit<ButtonProps, "children" | "asChild"> & {
  /** The glyph; always shown. */
  icon: React.ReactNode;
  /** The words; shown from `collapse` up, and always the button's accessible name. */
  label: string;
  /** Below this breakpoint the button is the glyph alone, square, with the label as a tooltip. Default `sm`. */
  collapse?: keyof typeof QUERY;
  /** Renders a link instead of a button (a Next link; `newTab` for a plain one that opens a new tab, e.g. "View site"). */
  href?: string;
  newTab?: boolean;
  /** A keyboard shortcut: the tooltip then shows at every size, with the shortcut after the label. */
  shortcut?: string;
};

/**
 * A toolbar or header action that is icon + label where there is room and a named, tooltipped glyph where there
 * isn't, so a label is never cut short:
 *   <ActionButton icon={<CalendarPlus />} label="New booking" variant="primary" onClick={…} />
 */
export function ActionButton({
  icon,
  label,
  collapse = "sm",
  href,
  newTab,
  shortcut,
  className,
  ...props
}: ActionButtonProps) {
  const collapsed = useMediaQuery(QUERY[collapse]);
  const content = (
    <>
      {icon}
      <span className={LABEL[collapse]}>{label}</span>
    </>
  );
  return (
    <Tooltip content={label} shortcut={shortcut} disabled={!collapsed && !shortcut}>
      {href ? (
        <Button asChild className={cn(SQUARE[collapse], className)} {...props}>
          {newTab ? (
            <a href={href} target="_blank" rel="noopener">
              {content}
            </a>
          ) : (
            <Link href={href}>{content}</Link>
          )}
        </Button>
      ) : (
        <Button className={cn(SQUARE[collapse], className)} {...props}>
          {content}
        </Button>
      )}
    </Tooltip>
  );
}
