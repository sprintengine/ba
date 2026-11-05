import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { priceLabel } from "@/lib/booking/quote";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { INDUSTRIES } from "@/components/shells/industries";
import { INDUSTRY_LIST } from "./industry-content";
import type { IndustryContent } from "./industries/types";

const OTHERS = [
  "Hair and beauty salons",
  "Fitness classes",
  "Tutors",
  "Dog groomers",
  "Photo studios",
  "Driving instructors",
  "Consultants",
];

/** Grid of launch-industry cards, each themed in its example business's colour. */
export function IndustryCards({
  exclude,
  showOther = true,
  swipe = false,
}: {
  exclude?: string;
  showOther?: boolean;
  /** On a phone, one row to swipe through instead of a long stack. */
  swipe?: boolean;
}) {
  const list = INDUSTRY_LIST.filter((c) => c.slug !== exclude);
  return (
    <div className="grid gap-4">
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          list.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
          swipe &&
            "max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-px-4 max-sm:scrollbar-none max-sm:overflow-x-auto max-sm:px-4 max-sm:*:w-[82%] max-sm:*:shrink-0 max-sm:*:snap-start",
        )}
      >
        {list.map((c) => (
          <IndustryCard key={c.slug} content={c} />
        ))}
      </div>
      {showOther && (
        <div className="flex flex-col gap-6 rounded-2xl border border-dashed border-border-strong bg-surface-sunken/50 p-6 sm:p-7 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Sparkles className="size-4 text-brand" /> Don&apos;t see your business?
            </h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              If you work by appointment, it will fit. Describe your business and we&apos;ll draft a setup for
              you to check.
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {OTHERS.map((o) => (
                <li
                  key={o}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground dark:bg-surface-raised"
                >
                  {o}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/sign-up"
            className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-lg border border-border bg-surface px-4 text-sm font-medium shadow-xs transition-colors hover:border-border-strong hover:bg-accent lg:self-center dark:bg-surface-raised"
          >
            Describe your business <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function IndustryCard({ content: c }: { content: IndustryContent }) {
  const name = INDUSTRIES.find((i) => i.slug === c.slug)?.name ?? c.slug;
  return (
    <BusinessThemeProvider primaryColor={c.color} className="flex">
      <Link
        href={`/for/${c.slug}`}
        className="group focus-ring relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-border hover:shadow-lg"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-brand-soft to-transparent opacity-70"
        />
        <div className="relative flex items-start justify-between gap-3 p-5 pb-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-button">
            <c.icon className="size-5" />
          </span>
          <ArrowUpRight className="size-4 text-subtle-foreground transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand" />
        </div>
        <div className="relative px-5">
          <h3 className="text-base font-semibold tracking-tight">{name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">e.g. {c.business.name}</p>
        </div>
        <ul className="relative mt-4 flex flex-1 flex-col divide-y divide-border-subtle border-t border-border-subtle px-5">
          {c.services.slice(0, 3).map((s) => (
            <li key={s.name} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">{s.name}</span>
              <span className="tnum shrink-0 text-xs text-muted-foreground">
                {formatDuration(s.durationMinutes)} ·{" "}
                <span className="text-foreground">{priceLabel(s, "EUR")}</span>
              </span>
            </li>
          ))}
        </ul>
        <span className="relative border-t border-border-subtle px-5 py-3 text-sm font-medium text-brand">
          See an example
        </span>
      </Link>
    </BusinessThemeProvider>
  );
}
