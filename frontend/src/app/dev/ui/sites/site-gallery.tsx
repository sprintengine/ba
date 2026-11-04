"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePublicBusiness, usePublicServices } from "@/lib/api/hooks";
import type { SiteThemeKey } from "@/lib/api/types";
import { SITE_THEME_KEYS, SITE_THEMES } from "@/lib/site/themes";
import { SECTION_TYPES, sectionDef } from "@/lib/site/sections";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { ScaledFrame } from "@/components/site/scaled-frame";
import { SiteRenderer } from "@/components/site/site-renderer";
import { FullPageLoader } from "@/components/common/feedback";

/**
 * /dev/ui/sites: every theme with the sample site (and the section list), or one full page:
 *   ?theme=bold&mode=dark                  sample business
 *   ?theme=bold&mode=dark&slug=lumen-physio a live business's published plan with the theme swapped
 */
export function SiteGallery() {
  const params = useSearchParams();
  const requested = params.get("theme");
  const theme = requested !== null && requested in SITE_THEMES ? (requested as SiteThemeKey) : null;
  const mode = params.get("mode") === "dark" ? "dark" : params.get("mode") === "light" ? "light" : undefined;
  const slug = params.get("slug");
  if (slug) return <LiveSite slug={slug} theme={theme} mode={mode} />;
  if (theme) {
    return (
      <SiteRenderer
        plan={samplePlan(theme)}
        business={SAMPLE_BUSINESS}
        services={SAMPLE_SERVICES}
        context={SAMPLE_CONTEXT}
        colorMode={mode}
        mode="preview"
      />
    );
  }
  return <Overview />;
}

function LiveSite({
  slug,
  theme,
  mode,
}: {
  slug: string;
  theme: SiteThemeKey | null;
  mode?: "light" | "dark";
}) {
  const business = usePublicBusiness(slug);
  const services = usePublicServices(slug);
  if (!business.data?.site || !services.data) return <FullPageLoader />;
  const site = business.data.site;
  const plan = theme ? { ...site.plan, theme } : site.plan;
  return (
    <SiteRenderer
      plan={plan}
      business={business.data}
      services={services.data}
      context={site.context}
      colorMode={mode}
    />
  );
}

function Overview() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/dev/ui" className="text-brand hover:underline">
            Design system
          </Link>{" "}
          / Site themes
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Site themes and sections</h1>
        <p className="max-w-2xl text-muted-foreground">
          Six themes rendered with the same fictional plan. Open one for the full page, add{" "}
          <code>&amp;mode=dark</code>, or <code>&amp;slug=lumen-physio</code> for a live business.
        </p>
      </header>
      <section className="grid gap-8 lg:grid-cols-2">
        {SITE_THEME_KEYS.map((key) => (
          <article key={key} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">{SITE_THEMES[key].name}</h2>
              <span className="flex gap-3 text-sm">
                <Link className="text-brand hover:underline" href={`/dev/ui/sites?theme=${key}&mode=light`}>
                  Light
                </Link>
                <Link className="text-brand hover:underline" href={`/dev/ui/sites?theme=${key}&mode=dark`}>
                  Dark
                </Link>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {SITE_THEMES[key].description} Best for {SITE_THEMES[key].bestFor.toLowerCase()}.
            </p>
            <div className="grid grid-cols-[1fr_7.5rem] gap-3">
              {(["light", "dark"] as const).map((m) => (
                <ScaledFrame
                  key={m}
                  width={m === "light" ? 1280 : 390}
                  className="h-80 rounded-xl border border-border shadow-sm"
                >
                  <SiteRenderer
                    plan={samplePlan(key)}
                    business={SAMPLE_BUSINESS}
                    services={SAMPLE_SERVICES}
                    context={SAMPLE_CONTEXT}
                    colorMode={m}
                    mode="preview"
                  />
                </ScaledFrame>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Section blocks</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {SECTION_TYPES.map((t) => (
            <li key={t} className="rounded-lg border border-border bg-surface p-3">
              <p className="font-medium">{sectionDef(t).label}</p>
              <p className="text-sm text-muted-foreground">{sectionDef(t).description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
