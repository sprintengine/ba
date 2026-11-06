import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { priceLabel } from "@/lib/booking/quote";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { INDUSTRIES } from "@/components/shells/industries";
import { INDUSTRY_LIST } from "./industry-content";
import { EXAMPLE_CARDS, photoSrc, photoSrcSet } from "./landing/examples/cards";
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
export function IndustryCards({ exclude, showOther = true }: { exclude?: string; showOther?: boolean }) {
  const list = INDUSTRY_LIST.filter((c) => c.slug !== exclude);
  return (
    <div className="grid gap-4">
      <div
        className={cn("grid gap-4 sm:grid-cols-2", list.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}
      >
        {list.map((c) => (
          <IndustryCard key={c.slug} content={c} />
        ))}
      </div>
      {showOther && (
        <div className="flex flex-col gap-6 rounded-2xl border border-dashed border-border-strong bg-surface-sunken/50 p-6 sm:p-7 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <LogoMark className="h-3.5 w-auto" aria-hidden title="" /> Don&apos;t see your business?
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
  const photo = EXAMPLE_CARDS.find((e) => e.page === c.slug);
  return (
    <BusinessThemeProvider primaryColor={c.color} className="flex">
      <Link
        href={`/for/${c.slug}`}
        className="group focus-ring relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-border hover:shadow-lg"
      >
        {photo && (
          <span className="relative block aspect-[3/2] w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- static WebP in two sizes; next/image is not used */}
            <img
              src={photoSrc(photo.photo, 960)}
              srcSet={photoSrcSet(photo.photo)}
              sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
              alt={photo.alt}
              width={960}
              height={640}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-[scale] duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
            />
          </span>
        )}
        <ArrowUpRight
          aria-hidden
          className="absolute top-3 right-3 size-7 rounded-full bg-black/55 p-1.5 text-white backdrop-blur-sm transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
        <div className="relative px-5 pt-4">
          <h3 className="text-base font-semibold tracking-tight">{name}</h3>
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
        <span className="relative border-t border-border-subtle px-5 py-3 text-sm font-medium text-foreground">
          See this template
        </span>
      </Link>
    </BusinessThemeProvider>
  );
}
