import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Data table primitives. Wrap in <TableContainer> for the bordered card look
 * and horizontal scroll on mobile.
 *   <TableContainer><Table><TableHeader><TableRow><TableHead sort="asc" onSort={…}>Name</TableHead>…
 */
export function TableContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative w-full scrollbar-thin overflow-x-auto rounded-xl border border-border bg-surface shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />;
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("bg-surface-sunken/70 [&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot className={cn("border-t border-border bg-surface-sunken/70 font-medium", className)} {...props} />
  );
}

/**
 * A table row. `interactive` gives a clickable row's hover look; `onActivate` makes the whole row the control: it is
 * reachable with Tab, a click or Enter/Space activates it, and it shows the focus. Keys pressed on a control inside
 * the row are left to that control. Pass an `aria-label` when the cells alone don't say what the row opens.
 */
export function TableRow({
  className,
  interactive,
  onActivate,
  onClick,
  onKeyDown,
  ...props
}: React.ComponentProps<"tr"> & { interactive?: boolean; onActivate?: () => void }) {
  return (
    <tr
      className={cn(
        "border-b border-border-subtle transition-colors data-[state=selected]:bg-brand-soft/50",
        (interactive || onActivate) && "cursor-pointer hover:bg-accent/60",
        onActivate && "focus-visible:bg-accent/60 focus-visible:outline-none",
        className,
      )}
      tabIndex={onActivate ? 0 : undefined}
      onClick={
        onActivate
          ? (e) => {
              onClick?.(e);
              if (!e.defaultPrevented) onActivate();
            }
          : onClick
      }
      onKeyDown={
        onActivate
          ? (e) => {
              onKeyDown?.(e);
              if (e.defaultPrevented || e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : onKeyDown
      }
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | false;

export function TableHead({
  className,
  children,
  sort,
  onSort,
  align = "left",
  ...props
}: React.ComponentProps<"th"> & {
  /** Current sort of this column; pass `false` for sortable-but-unsorted. Omit for non-sortable. */
  sort?: SortDirection;
  onSort?: () => void;
  align?: "left" | "right" | "center";
}) {
  const sortable = sort !== undefined && !!onSort;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      aria-sort={
        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : sortable ? "none" : undefined
      }
      className={cn(
        "h-9 px-4 align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5",
        alignClass,
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-10",
            sort && "text-foreground",
            align === "right" && "flex-row-reverse",
          )}
        >
          {children}
          {sort === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : sort === "desc" ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-50" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TableCell({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "h-12 px-4 align-middle first:pl-5 last:pr-5",
        align === "right" && "tnum text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("py-3 text-xs text-muted-foreground", className)} {...props} />;
}
