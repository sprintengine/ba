"use client";

import { ArrowUpRight, MapPin } from "lucide-react";
import { isoWeekday, todayInTz } from "@/lib/format";
import { formatIntervals, mapLink, WEEKDAY_NAMES } from "@/lib/site/plan";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { useSiteRender } from "../site-render-context";
import { CARD } from "../theme-classes";
import type { SectionProps } from "./types";

/** Opening hours from the real weekly availability, plus the business address. */
export function HoursSection({ section, anchor }: SectionProps<"hours">) {
  const { business, context, theme } = useSiteRender();
  const c = section.content;
  const today = isoWeekday(todayInTz(business.timezone));
  const address = [
    business.address.line1,
    business.address.line2,
    business.address.city,
    business.address.postcode,
  ].filter(Boolean);
  const map = c.showMapLink ? mapLink([business.name, ...address]) : null;
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    day: d,
    hours: formatIntervals(context.openingHours.find((h) => h.dayOfWeek === d)),
  }));
  return (
    <SectionShell anchor={anchor} sectionId={section.id} tone="sunken">
      <SiteContainer className="grid gap-10 @4xl:grid-cols-2 @4xl:gap-16">
        <div className="flex flex-col gap-8">
          <SectionIntro heading={c.heading} intro={c.note} />
          {c.showAddress && address.length > 0 && (
            <div
              className={cn("flex flex-col gap-4 p-6", CARD[theme.card], theme.card === "hairline" && "px-0")}
            >
              <p className="flex items-start gap-3 text-lg">
                <MapPin className="mt-1 size-5 shrink-0 text-highlight" aria-hidden />
                <span>
                  {address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </p>
              {map && (
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline",
                    touchHitArea,
                  )}
                >
                  Get directions <ArrowUpRight className="size-4" aria-hidden />
                </a>
              )}
            </div>
          )}
        </div>
        <dl
          className={cn(
            "flex flex-col self-start overflow-hidden",
            CARD[theme.card],
            theme.card === "hairline" && "border-b",
          )}
        >
          {days.map(({ day, hours }) => (
            <div
              key={day}
              className={cn(
                "flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3.5 last:border-b-0 @3xl:px-6",
                day === today && "bg-brand-soft text-brand-soft-foreground",
              )}
            >
              <dt className="flex items-center gap-2 font-medium">
                {WEEKDAY_NAMES[day - 1]}
                {day === today && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-2xs font-semibold text-brand-foreground">
                    Today
                  </span>
                )}
              </dt>
              <dd className={cn("tnum text-right", !hours && "text-muted-foreground")}>
                {hours ?? "Closed"}
              </dd>
            </div>
          ))}
        </dl>
      </SiteContainer>
    </SectionShell>
  );
}
