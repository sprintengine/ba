import { cn } from "@/lib/utils";

/**
 * Card — a titled section of a page.
 *   <Card><CardHeader><CardTitle/><CardDescription/><CardAction/></CardHeader><CardContent/><CardFooter/></Card>
 * By default it is flat: a hairline over the section and nothing round it, so pages read as one sheet. `variant="panel"`
 * is the boxed version, for what stands alone on a bare page (sign-in and consent, customer pages). `interactive` adds
 * hover elevation to a panel (for clickable cards; wrap with <Link> or pass asChild patterns).
 */
export function Card({
  className,
  variant = "section",
  interactive,
  ...props
}: React.ComponentProps<"div"> & { variant?: "section" | "panel"; interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "group/card flex min-w-0 flex-col text-foreground",
        variant === "section" && "border-t border-border",
        variant === "panel" && "rounded-xl border border-border bg-surface shadow-xs",
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
        "@container/card-header grid auto-rows-min grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 pt-4 pb-3 group-data-[variant=panel]/card:px-5 group-data-[variant=panel]/card:pt-5 has-[+[data-slot=card-footer]]:pb-5",
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
  return (
    <div
      className={cn(
        "pb-6 group-data-[variant=panel]/card:px-5 group-data-[variant=panel]/card:pb-5 first:pt-4 group-data-[variant=panel]/card:first:pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex items-center gap-2 border-t border-border-subtle py-3 group-data-[variant=panel]/card:rounded-b-xl group-data-[variant=panel]/card:bg-surface-sunken/60 group-data-[variant=panel]/card:px-5",
        className,
      )}
      {...props}
    />
  );
}
