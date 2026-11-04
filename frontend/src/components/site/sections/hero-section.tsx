"use client";

import { MapPin } from "lucide-react";
import type { SiteSectionOf } from "@/lib/api/types";
import { sectionAnchor } from "@/lib/site/plan";
import { cn } from "@/lib/utils";
import { BookButton, Eyebrow, SiteContainer } from "../primitives";
import { SiteImageFill, SiteMedia } from "../site-media";
import { useSiteRender } from "../site-render-context";
import { TYPE } from "../theme-classes";
import type { SectionProps } from "./types";

export function HeroSection({ section, anchor }: SectionProps<"hero">) {
  const { plan } = useSiteRender();
  const c = section.content;
  const services = plan.sections.find((s) => s.type === "services" && s.enabled);
  const servicesAnchor = services ? sectionAnchor(services, plan.sections) : null;
  const Variant = c.variant === "cover" ? CoverHero : c.variant === "minimal" ? MinimalHero : SplitHero;
  return (
    <section id={anchor} data-section-id={section.id} data-hero-variant={c.variant} className="relative">
      <Variant section={section} servicesAnchor={servicesAnchor} />
    </section>
  );
}

type VariantProps = { section: SiteSectionOf<"hero">; servicesAnchor: string | null };

function HeroActions({
  section,
  servicesAnchor,
  onDark = false,
  center = false,
}: VariantProps & { onDark?: boolean; center?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", center && "justify-center")}>
      <BookButton size="xl" arrow className={cn(onDark && "shadow-lg")}>
        {section.content.ctaLabel || "Book now"}
      </BookButton>
      {servicesAnchor && (
        <a
          href={`#${servicesAnchor}`}
          className={cn(
            "inline-flex h-12 items-center rounded-button px-5 text-base font-medium transition-colors",
            onDark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-accent",
          )}
        >
          View services
        </a>
      )}
    </div>
  );
}

function Place({ onDark = false }: { onDark?: boolean }) {
  const { business } = useSiteRender();
  const place = [business.address.line1, business.address.city].filter(Boolean).join(", ");
  if (!place) return null;
  return (
    <p
      className={cn("flex items-center gap-1.5 text-sm", onDark ? "text-white/80" : "text-subtle-foreground")}
    >
      <MapPin className="size-4 shrink-0" aria-hidden /> {place}
    </p>
  );
}

function SplitHero({ section, servicesAnchor }: VariantProps) {
  const { theme, plan } = useSiteRender();
  const c = section.content;
  return (
    <div className="overflow-hidden">
      <SiteContainer className="grid items-center gap-10 py-12 @3xl:py-16 @5xl:grid-cols-[1.05fr_0.95fr] @5xl:gap-16 @5xl:py-24">
        <div className="flex animate-rise flex-col gap-6">
          {c.eyebrow && <Eyebrow>{c.eyebrow}</Eyebrow>}
          <h1 className={cn("site-heading", TYPE[plan.theme].display)}>{c.headline}</h1>
          {c.subheadline && (
            <p className={cn("max-w-xl text-pretty text-muted-foreground", TYPE[plan.theme].lead)}>
              {c.subheadline}
            </p>
          )}
          <HeroActions section={section} servicesAnchor={servicesAnchor} />
          <Place />
        </div>
        <SiteMedia
          image={c.image}
          fallbackPattern={theme.defaultPattern}
          treatment={theme.image}
          eager
          className={cn(
            "mx-auto w-full",
            theme.image === "arch" ? "aspect-[4/5] max-w-md" : "aspect-[4/3] max-w-xl @5xl:aspect-[5/6]",
          )}
        />
      </SiteContainer>
    </div>
  );
}

function CoverHero({ section, servicesAnchor }: VariantProps) {
  const { theme, plan } = useSiteRender();
  const c = section.content;
  const centered = theme.header === "centered";
  return (
    <div className="relative isolate flex min-h-[32rem] items-end overflow-hidden bg-foreground @3xl:min-h-[38rem]">
      <div className="absolute inset-0 -z-10">
        <SiteImageFill image={c.image} fallbackPattern={theme.defaultPattern} tone="deep" eager />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/75 via-black/35 to-black/10" />
      </div>
      <SiteContainer
        className={cn(
          "flex flex-col gap-6 py-14 text-white @3xl:py-20",
          centered && "items-center text-center",
        )}
      >
        {c.eyebrow && (
          <p className="text-xs font-semibold tracking-[0.2em] text-white/80 uppercase">{c.eyebrow}</p>
        )}
        <h1 className={cn("site-heading max-w-4xl text-white", TYPE[plan.theme].display)}>{c.headline}</h1>
        {c.subheadline && (
          <p className={cn("max-w-2xl text-pretty text-white/85", TYPE[plan.theme].lead)}>{c.subheadline}</p>
        )}
        <HeroActions section={section} servicesAnchor={servicesAnchor} onDark center={centered} />
        <Place onDark />
      </SiteContainer>
    </div>
  );
}

function MinimalHero({ section, servicesAnchor }: VariantProps) {
  const { theme, plan } = useSiteRender();
  const c = section.content;
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[70%] [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-70"
      >
        <SiteImageFill
          image={c.image?.kind === "generated" ? c.image : null}
          fallbackPattern={theme.defaultPattern}
        />
      </div>
      <SiteContainer className="flex flex-col items-center gap-6 py-20 text-center @3xl:py-28 @5xl:py-36">
        {c.eyebrow && <Eyebrow>{c.eyebrow}</Eyebrow>}
        <h1 className={cn("site-heading max-w-4xl", TYPE[plan.theme].display)}>{c.headline}</h1>
        {c.subheadline && (
          <p className={cn("max-w-2xl text-pretty text-muted-foreground", TYPE[plan.theme].lead)}>
            {c.subheadline}
          </p>
        )}
        <HeroActions section={section} servicesAnchor={servicesAnchor} center />
        <Place />
      </SiteContainer>
      {c.image && c.image.kind !== "generated" && (
        <SiteContainer className="pb-16 @3xl:pb-24">
          <SiteMedia
            image={c.image}
            fallbackPattern={theme.defaultPattern}
            treatment={theme.image}
            className="aspect-[21/9] w-full"
          />
        </SiteContainer>
      )}
    </div>
  );
}
