"use client";

import { Check } from "lucide-react";
import { paragraphs } from "@/lib/site/plan";
import { cn } from "@/lib/utils";
import { EmptyHint, SectionShell, SiteContainer } from "../primitives";
import { SiteMedia } from "../site-media";
import { useSiteRender } from "../site-render-context";
import { TYPE } from "../theme-classes";
import type { SectionProps } from "./types";

export function AboutSection({ section, anchor }: SectionProps<"about">) {
  const { plan, theme } = useSiteRender();
  const c = section.content;
  const body = paragraphs(c.body);
  const withImage = !!c.image;
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer
        className={cn("grid gap-10 @4xl:gap-16", withImage && "@4xl:grid-cols-2 @4xl:items-center")}
      >
        <div
          className={cn(
            "flex flex-col gap-6",
            !withImage && "@4xl:grid @4xl:grid-cols-[0.8fr_1.2fr] @4xl:gap-16",
          )}
        >
          <h2 className={cn("site-heading", TYPE[plan.theme].title)}>{c.heading}</h2>
          <div className="flex flex-col gap-6">
            {body.length === 0 ? (
              <EmptyHint title="Tell your story">Write a few lines about your business.</EmptyHint>
            ) : (
              <div
                className={cn("flex flex-col gap-4 text-pretty text-muted-foreground", TYPE[plan.theme].lead)}
              >
                {body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {c.highlights.length > 0 && (
              <ul className="grid gap-3 @xl:grid-cols-2">
                {c.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-highlight-soft text-highlight-soft-foreground">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="font-medium">{h}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {withImage && (
          <SiteMedia
            image={c.image}
            fallbackPattern={theme.defaultPattern}
            treatment={theme.image}
            className="aspect-[4/3] w-full @4xl:aspect-square"
          />
        )}
      </SiteContainer>
    </SectionShell>
  );
}
