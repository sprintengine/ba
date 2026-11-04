"use client";

import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import type { PublicService } from "@/lib/api/types";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import { resolveServices } from "@/lib/site/plan";
import { cn } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { useSiteRender } from "../site-render-context";
import { CARD, CARD_HOVER } from "../theme-classes";
import type { SectionProps } from "./types";

/** Live services (names, prices, durations come from the real services, never from the plan). */
export function ServicesSection({ section, anchor }: SectionProps<"services">) {
  const { services, theme } = useSiteRender();
  const c = section.content;
  const list = resolveServices(c.serviceIds, services);
  const Layout = LAYOUTS[theme.services];
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer className="flex flex-col gap-10 @3xl:gap-14">
        <SectionIntro heading={c.heading} intro={c.intro} />
        {list.length === 0 ? (
          <EmptyHint title="No services to show">
            Add public services in Services, or pick some for this section.
          </EmptyHint>
        ) : (
          <Layout services={list} showPrices={c.showPrices} showDurations={c.showDurations} />
        )}
      </SiteContainer>
    </SectionShell>
  );
}

type LayoutProps = { services: PublicService[]; showPrices: boolean; showDurations: boolean };

function useServiceMeta() {
  const { business } = useSiteRender();
  return (s: PublicService) => ({
    price: priceLabel(s, business.currency, { locale: business.locale, capitalize: true }),
    duration: durationLabel(s),
  });
}

function Meta({
  service,
  showPrices,
  showDurations,
  className,
}: { service: PublicService } & Omit<LayoutProps, "services"> & { className?: string }) {
  const meta = useServiceMeta()(service);
  if (!showPrices && !showDurations) return null;
  return (
    <p
      className={cn(
        "tnum flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      {showDurations && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden /> {meta.duration}
        </span>
      )}
      {showPrices && <span className="font-semibold text-foreground">{meta.price}</span>}
    </p>
  );
}

function ServiceLink({
  service,
  className,
  children,
}: {
  service: PublicService;
  className?: string;
  children: React.ReactNode;
}) {
  const { bookHref } = useSiteRender();
  return (
    <Link
      href={bookHref(service.id)}
      className={cn("group focus-ring", className)}
      aria-label={`Book ${service.name}`}
    >
      {children}
    </Link>
  );
}

/** Rows with a Book action (clinical, minimal). */
function ListLayout({ services, showPrices, showDurations }: LayoutProps) {
  const { theme } = useSiteRender();
  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden",
        theme.card === "bordered" ? CARD.bordered : "border-y border-border",
      )}
    >
      {services.map((s) => (
        <li key={s.id}>
          <ServiceLink
            service={s}
            className="flex items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-sunken @3xl:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="text-lg font-semibold tracking-tight">{s.name}</h3>
              {s.description && (
                <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">{s.description}</p>
              )}
              <Meta
                service={s}
                showPrices={showPrices}
                showDurations={showDurations}
                className="mt-1 @3xl:hidden"
              />
            </div>
            <Meta
              service={s}
              showPrices={showPrices}
              showDurations={showDurations}
              className="hidden shrink-0 @3xl:flex"
            />
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-foreground">
              <ArrowUpRight className="size-4" aria-hidden />
            </span>
          </ServiceLink>
        </li>
      ))}
    </ul>
  );
}

/** Card grid (calm, playful). */
function CardsLayout({ services, showPrices, showDurations }: LayoutProps) {
  const { theme } = useSiteRender();
  return (
    <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @5xl:gap-6">
      {services.map((s, i) => (
        <li key={s.id} className="flex">
          <ServiceLink
            service={s}
            className={cn(
              "relative flex w-full flex-col gap-3 overflow-hidden p-6 @3xl:p-7",
              CARD[theme.card],
              CARD_HOVER[theme.card],
            )}
          >
            {theme.card === "playful" && (
              <span
                aria-hidden
                className={cn(
                  "absolute -top-6 -right-6 size-20 rounded-full opacity-80",
                  i % 2 ? "bg-highlight-soft" : "bg-brand-soft",
                )}
              />
            )}
            <h3 className="site-heading relative text-2xl">{s.name}</h3>
            {s.description && (
              <p className="relative line-clamp-3 text-pretty text-muted-foreground">{s.description}</p>
            )}
            <div className="relative mt-auto flex items-end justify-between gap-3 pt-4">
              <Meta service={s} showPrices={showPrices} showDurations={showDurations} />
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                Book{" "}
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              </span>
            </div>
          </ServiceLink>
        </li>
      ))}
    </ul>
  );
}

/** A price-list menu with dotted leaders (editorial). */
function MenuLayout({ services, showPrices, showDurations }: LayoutProps) {
  const meta = useServiceMeta();
  return (
    <ul className="grid gap-x-16 gap-y-2 @4xl:grid-cols-2">
      {services.map((s) => {
        const m = meta(s);
        return (
          <li key={s.id}>
            <ServiceLink service={s} className="flex flex-col gap-1.5 border-b border-border py-5">
              <div className="flex items-baseline gap-3">
                <h3 className="site-heading text-2xl group-hover:italic @3xl:text-[1.75rem]">{s.name}</h3>
                <span
                  aria-hidden
                  className="mb-1.5 min-w-6 flex-1 border-b border-dotted border-border-strong"
                />
                {showPrices && <span className="tnum text-lg">{m.price}</span>}
              </div>
              {(s.description || showDurations) && (
                <p className="text-sm text-muted-foreground">
                  {showDurations && <span className="tnum">{m.duration}</span>}
                  {showDurations && s.description && <span aria-hidden> · </span>}
                  {s.description}
                </p>
              )}
            </ServiceLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Big numbered rows with heavy rules (bold). */
function NumberedLayout({ services, showPrices, showDurations }: LayoutProps) {
  const meta = useServiceMeta();
  return (
    <ol className="border-t-2 border-border-strong">
      {services.map((s, i) => {
        const m = meta(s);
        return (
          <li key={s.id}>
            <ServiceLink
              service={s}
              className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2 border-b-2 border-border-strong px-1 py-6 transition-colors hover:bg-foreground hover:text-background @3xl:grid-cols-[5rem_1fr_auto_auto] @3xl:items-center @3xl:gap-x-8"
            >
              <span className="site-heading tnum text-3xl text-highlight group-hover:text-background @3xl:text-4xl">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="site-heading text-2xl @3xl:text-3xl">{s.name}</h3>
                {s.description && <p className="line-clamp-2 text-sm opacity-75">{s.description}</p>}
              </div>
              {showDurations && (
                <span className="tnum col-start-2 text-sm font-medium opacity-75 @3xl:col-start-auto">
                  {m.duration}
                </span>
              )}
              {showPrices && (
                <span className="site-heading tnum col-start-2 text-2xl @3xl:col-start-auto">{m.price}</span>
              )}
            </ServiceLink>
          </li>
        );
      })}
    </ol>
  );
}

const LAYOUTS = { list: ListLayout, cards: CardsLayout, menu: MenuLayout, numbered: NumberedLayout } as const;
