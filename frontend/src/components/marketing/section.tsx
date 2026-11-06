import { cn } from "@/lib/utils";

/** Page-width container used by every marketing section. */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

/** A marketing section with consistent vertical rhythm. `id` sections get scroll margin for the sticky nav. */
export function Section({
  className,
  containerClassName,
  children,
  ...props
}: React.ComponentProps<"section"> & { containerClassName?: string }) {
  return (
    <section className={cn("scroll-mt-24 py-20 sm:py-28", className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Eyebrow + h2 + lead paragraph. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  as: Heading = "h2",
  id,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  as?: "h1" | "h2";
  id?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-3xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading
        id={id}
        className={cn(
          "font-semibold tracking-tight text-balance",
          Heading === "h1" ? "text-4xl sm:text-display-sm" : "text-3xl sm:text-4xl",
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg sm:leading-8">{description}</p>
      )}
    </div>
  );
}

/**
 * A bare browser window for product previews: traffic lights + address bar.
 * Purely decorative chrome; the content inside is real UI.
 */
export function BrowserFrame({
  url,
  className,
  bodyClassName,
  children,
}: {
  url: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-xl ring-1 ring-black/[0.02] dark:bg-surface dark:ring-white/[0.03]",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-3 border-b border-border-subtle bg-surface-sunken/70 px-3.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </span>
        <span className="mx-auto flex h-6 max-w-[60%] min-w-0 items-center justify-center rounded-md bg-muted/80 px-3 font-mono text-2xs text-subtle-foreground">
          <span className="truncate">{url}</span>
        </span>
        <span aria-hidden className="w-[42px]" />
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** Small icon tile used on feature cards. */
export function FeatureIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-soft text-brand-soft-foreground [&_svg]:size-[1.125rem]",
        className,
      )}
    >
      {children}
    </span>
  );
}
