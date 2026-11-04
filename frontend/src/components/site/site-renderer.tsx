"use client";

import { Fragment, memo } from "react";
import type { PublicService, SiteContext, SitePlan, SiteSection } from "@/lib/api/types";
import { sectionAnchor } from "@/lib/site/plan";
import { sectionHasContent, sectionMeta, withMeta } from "@/lib/site/section-meta";
import { VocabularyProvider } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
import { rendererFor } from "./section-renderers";
import { MobileBookBar, SiteFooter } from "./site-footer";
import { SiteHeader, type NavItem } from "./site-header";
import {
  bookHrefFor,
  SiteRenderProvider,
  type SiteBusiness,
  type SiteRenderMode,
} from "./site-render-context";
import { SiteScope } from "./site-scope";

export type SiteRendererProps = {
  plan: SitePlan;
  business: SiteBusiness;
  services: PublicService[];
  context: SiteContext;
  /** public: hide empty sections; preview: show hints for them; thumbnail: hero only, no chrome. */
  mode?: SiteRenderMode;
  /** Force light/dark (previews); omit to follow the visitor. */
  colorMode?: "light" | "dark";
  /** Right side of the header (sign-in / my bookings). */
  headerAction?: React.ReactNode;
  /** Editor: highlight a section. */
  selectedSectionId?: string | null;
  /** Live content outside the plan (e.g. current deals), shown after the hero or first on the page. */
  afterHero?: React.ReactNode;
  className?: string;
};

/**
 * Renders a site plan with the design system: theme scope, header, the enabled sections in order
 * (live services, team and hours), footer and a mobile Book bar. Never renders owner HTML.
 * Memoised: the site editor re-renders around it on every keystroke, and a whole site is costly to render.
 */
export const SiteRenderer = memo(function SiteRenderer({
  plan,
  business,
  services,
  context,
  mode = "public",
  colorMode,
  headerAction,
  selectedSectionId,
  afterHero,
  className,
}: SiteRendererProps) {
  const data = {
    services,
    context,
    hasAddress: !!(business.address.line1 || business.address.city),
    hasContactDetails: !!(
      business.contactPhone ||
      business.contactEmail ||
      business.address.line1 ||
      business.address.city
    ),
  };
  const visible = (s: SiteSection) => s.enabled && (mode !== "public" || sectionHasContent(s, data));
  const sections = plan.sections.filter(visible);
  const shown = mode === "thumbnail" ? sections.filter((s) => s.type === "hero").slice(0, 1) : sections;
  const nav = navItems(plan, sections);
  const extra = mode === "thumbnail" ? null : afterHero;
  const extraAt = shown[0]?.type === "hero" ? 1 : 0;
  // An editor preview sits inside a page that has its own <main id="main">: no second main landmark or duplicate id.
  const Main = mode === "preview" ? "div" : "main";

  return (
    <SiteScope
      theme={plan.theme}
      palette={plan.palette}
      mode={colorMode}
      // `clip`, not `hidden`: tilted and offset artwork can't push the page sideways, and the sticky header still sticks.
      className={cn("flex min-h-full flex-col overflow-x-clip", className)}
    >
      <SiteRenderProvider
        value={{ plan, business, services, context, mode, bookHref: bookHrefFor(business.slug) }}
      >
        <VocabularyProvider vocabulary={business.vocabulary}>
          {mode !== "thumbnail" && <SiteHeader nav={nav} action={headerAction} />}
          <Main id={mode === "preview" ? undefined : "main"} className="flex-1">
            {extraAt === 0 && extra}
            {shown.map((section, i) => (
              <Fragment key={section.id}>
                <div
                  data-selected={selectedSectionId === section.id || undefined}
                  className={cn(
                    mode === "preview" && "relative transition-shadow",
                    mode === "preview" &&
                      selectedSectionId === section.id &&
                      "z-10 shadow-[inset_0_0_0_3px_var(--ring)]",
                  )}
                >
                  <SectionBlock section={section} anchor={sectionAnchor(section, plan.sections)} />
                </div>
                {extraAt === 1 && i === 0 && extra}
              </Fragment>
            ))}
          </Main>
          {mode !== "thumbnail" && <SiteFooter />}
          {mode !== "thumbnail" && <MobileBookBar />}
        </VocabularyProvider>
      </SiteRenderProvider>
    </SiteScope>
  );
});

function SectionBlock({ section, anchor }: { section: SiteSection; anchor: string }) {
  return withMeta(section, (meta, s) => {
    const Renderer = rendererFor(meta.type);
    return <Renderer section={s} anchor={anchor} />;
  });
}

function navItems(plan: SitePlan, visible: SiteSection[]): NavItem[] {
  const seen = new Set<string>();
  return visible.flatMap((s) => {
    const label = sectionMeta(s.type).navLabel;
    if (!label || seen.has(s.type)) return [];
    seen.add(s.type);
    return [{ anchor: sectionAnchor(s, plan.sections), label }];
  });
}
