import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top of every page.
 *   <PageHeader title="Bookings" description="…" actions={<Button …/>} back={{ href: "..", label: "Customers" }} />
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  /** Small label above the title (e.g. a status badge or category). */
  eyebrow?: React.ReactNode;
  className?: string;
  /** Extra content under the header row (tabs, filters). */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-4 pb-6", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:h-11 pointer-coarse:pr-2"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      {/* Actions sit beside the title when they fit (a glyph on a phone, see ActionButton), else wrap under it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4 sm:flex-nowrap sm:items-end">
        <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-1">
          {eyebrow && <div className="mb-1">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Section heading inside a page. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
