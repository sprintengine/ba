"use client";

import { Quote } from "lucide-react";
import type { Testimonial } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { useSiteRender } from "../site-render-context";
import { CARD } from "../theme-classes";
import type { SectionProps } from "./types";

/** Testimonials only ever come from the owner; hidden publicly until there is one. */
export function TestimonialsSection({ section, anchor }: SectionProps<"testimonials">) {
  const items = section.content.items;
  const featured = items.length === 1 ? items[0] : undefined;
  return (
    <SectionShell anchor={anchor} sectionId={section.id} tone="sunken">
      <SiteContainer className="flex flex-col gap-10 @3xl:gap-14">
        <SectionIntro heading={section.content.heading} align={items.length === 1 ? "center" : "start"} />
        {items.length === 0 ? (
          <EmptyHint title="No testimonials yet">
            Add quotes from real customers (with their permission). This section stays hidden until you do.
          </EmptyHint>
        ) : featured ? (
          <FeaturedQuote item={featured} />
        ) : (
          <ul className="grid gap-5 @3xl:grid-cols-2 @5xl:grid-cols-3">
            {items.map((t, i) => (
              <li key={i}>
                <QuoteCard item={t} />
              </li>
            ))}
          </ul>
        )}
      </SiteContainer>
    </SectionShell>
  );
}

function Attribution({ item, center = false }: { item: Testimonial; center?: boolean }) {
  return (
    <footer className={cn("flex flex-col", center && "items-center")}>
      <cite className="font-semibold not-italic">{item.author}</cite>
      {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
    </footer>
  );
}

function FeaturedQuote({ item }: { item: Testimonial }) {
  return (
    <blockquote className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      <Quote className="size-10 text-highlight" aria-hidden />
      <p className="site-heading text-2xl text-pretty @3xl:text-4xl">“{item.quote}”</p>
      <Attribution item={item} center />
    </blockquote>
  );
}

function QuoteCard({ item }: { item: Testimonial }) {
  const { theme } = useSiteRender();
  return (
    <blockquote
      className={cn(
        "flex h-full flex-col gap-5 p-6 @3xl:p-7",
        CARD[theme.card],
        theme.card === "hairline" && "px-0",
      )}
    >
      <Quote className="size-6 text-highlight" aria-hidden />
      <p className="flex-1 text-lg text-pretty">“{item.quote}”</p>
      <Attribution item={item} />
    </blockquote>
  );
}
