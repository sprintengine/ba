"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShell, SiteContainer } from "../primitives";
import { GeneratedArt } from "../generated-art";
import { useSiteRender } from "../site-render-context";
import { TYPE } from "../theme-classes";
import type { SectionProps } from "./types";

/** A brand-coloured band with the Book button (inverted so it reads on the brand colour). */
export function CtaSection({ section, anchor }: SectionProps<"cta">) {
  const { plan, theme, bookHref } = useSiteRender();
  const c = section.content;
  const square = theme.radius.xxxl === "0";
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer>
        <div
          className={cn(
            "relative isolate flex flex-col items-start gap-6 overflow-hidden bg-brand px-6 py-12 text-brand-foreground @3xl:px-14 @3xl:py-16",
            !square && "rounded-3xl",
            theme.header === "centered" && "items-center text-center",
          )}
        >
          <div className="absolute inset-0 -z-10 opacity-35 mix-blend-soft-light">
            <GeneratedArt pattern={theme.defaultPattern} tone="deep" />
          </div>
          <h2 className={cn("site-heading max-w-3xl", TYPE[plan.theme].title)}>{c.headline}</h2>
          {c.body && <p className="max-w-2xl text-lg text-pretty opacity-90">{c.body}</p>}
          <Link
            href={bookHref()}
            className="focus-ring inline-flex h-12 items-center gap-2 rounded-button bg-brand-foreground px-6 text-base font-semibold text-brand shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {c.buttonLabel} <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>
      </SiteContainer>
    </SectionShell>
  );
}
