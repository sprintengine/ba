"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { useSiteRender } from "../site-render-context";
import { CARD } from "../theme-classes";
import type { SectionProps } from "./types";

/** Native <details> disclosure: accessible, works without JavaScript and in server HTML. */
export function FaqSection({ section, anchor }: SectionProps<"faq">) {
  const { theme } = useSiteRender();
  const items = section.content.items;
  const separate = theme.card !== "hairline" && theme.card !== "flat";
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer className="grid gap-10 @4xl:grid-cols-[0.8fr_1.2fr] @4xl:gap-16">
        <SectionIntro heading={section.content.heading} className="@4xl:sticky @4xl:top-28 @4xl:self-start" />
        {items.length === 0 ? (
          <EmptyHint title="No questions yet">Add the questions customers ask you most.</EmptyHint>
        ) : (
          <div className={cn("flex flex-col", separate ? "gap-3" : "border-b border-border")}>
            {items.map((item, i) => (
              <details
                key={i}
                className={cn(
                  "group",
                  separate ? cn(CARD[theme.card], "px-5 @3xl:px-6") : "border-t border-border",
                )}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-lg font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <ChevronDown
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 text-pretty whitespace-pre-line text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        )}
      </SiteContainer>
    </SectionShell>
  );
}
