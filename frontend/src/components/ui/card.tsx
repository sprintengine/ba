import { cn } from "@/lib/utils";

/**
 * Card — the default container for grouped content.
 *   <Card><CardHeader><CardTitle/><CardDescription/><CardAction/></CardHeader><CardContent/><CardFooter/></Card>
 * `interactive` adds hover elevation (for clickable cards; wrap with <Link> or pass asChild patterns).
 */
export function Card({
  className,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-surface text-foreground shadow-xs",
        interactive &&
          "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "@container/card-header grid auto-rows-min grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-5 pt-5 pb-3 has-[+[data-slot=card-footer]]:pb-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  children,
  headingLevel = 3,
  ...props
}: React.ComponentProps<"h3"> & {
  /** The title's heading level: one below the heading it sits under (2 for cards right under a page's title). */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Heading
      className={cn("col-start-1 text-base leading-6 font-semibold tracking-tight", className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("col-start-1 text-sm text-muted-foreground", className)} {...props} />;
}

/**
 * Top-right slot in a CardHeader (button, menu, badge). `wrap`: in a narrow card (under 32rem) it moves under the
 * title instead of squeezing it (several controls, e.g. two segmented switches).
 */
export function CardAction({ className, wrap, ...props }: React.ComponentProps<"div"> & { wrap?: boolean }) {
  return (
    <div
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        wrap &&
          "@max-lg/card-header:col-[1/-1] @max-lg/card-header:row-[auto] @max-lg/card-header:mt-2 @max-lg/card-header:justify-self-start",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5 first:pt-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex items-center gap-2 rounded-b-xl border-t border-border-subtle bg-surface-sunken/60 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
