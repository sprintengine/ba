"use client";

import { useState } from "react";
import { formatDuration, formatMoney, todayInTz } from "@/lib/format";
import { useMounted } from "@/lib/hooks/use-mounted";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { BusinessTile } from "@/components/shells/business-tile";
import type { IndustrySlug } from "@/components/shells/industries";
import { Button } from "@/components/ui/button";
import { INDUSTRY_CONTENT, quoteService } from "../industry-content";
import { BrowserFrame } from "../section";
import { BookedOverlay } from "./booked-overlay";
import {
  bookedSummary,
  nextOpenDays,
  previewCta,
  previewTimes,
  visiblePreviewServices,
} from "./preview-logic";
import {
  AddonPicker,
  DateTimePicker,
  GroupPicker,
  OptionPicker,
  PreviewQuestions,
  ResourcePicker,
  ServicePicker,
} from "./preview-pickers";

const TZ = "Europe/Dublin";

/**
 * A working, industry-flavoured booking page preview in the example business's
 * colour. Demonstrates options changing duration and price, add-ons, customer
 * groups with reserved windows, resource choice and (sensitive) questions.
 */
export function IndustryPreview({ slug }: { slug: IndustrySlug }) {
  const content = INDUSTRY_CONTENT[slug];
  const { preview, business } = content;
  const mounted = useMounted();

  const [group, setGroup] = useState(0);
  const [serviceIndex, setServiceIndex] = useState(preview.serviceIndex);
  const [optionIndex, setOptionIndex] = useState<number>(slug === "car-wash" ? 1 : 0);
  const [addons, setAddons] = useState<number[]>(slug === "car-wash" ? [0] : []);
  const [resource, setResource] = useState(preview.resourceChoices[0] ?? "");
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  // Customer groups restrict what's offered (music: trial for new students only; GP: GMS windows).
  const visible = visiblePreviewServices(content, group);
  const active = visible.find((v) => v.index === serviceIndex) ?? visible[0];
  if (!active) return null;
  const service = active.service;
  const option = service.options?.[optionIndex];
  const quote = quoteService(service, option ? optionIndex : null, addons);
  const days = mounted ? nextOpenDays(todayInTz(TZ), 5) : [];
  const times = previewTimes(content, group, slot);
  const booking = content.vocabulary.booking;
  const confirmation = bookedSummary(service, days[dayIndex], times.slot, booking);

  return (
    <BusinessThemeProvider primaryColor={content.color}>
      <BrowserFrame url={`bookanything.ie/${business.slug}`} className="text-left">
        <div className="relative flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <BusinessTile name={business.name} color={content.color} size="lg" className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight">{business.name}</p>
              <p className="truncate text-sm text-muted-foreground">{business.tagline}</p>
            </div>
          </div>

          <GroupPicker
            label={`${content.vocabulary.customer} type`}
            groups={preview.groups}
            value={group}
            onChange={setGroup}
          />
          <ServicePicker
            services={visible}
            value={active.index}
            onChange={(index) => {
              setServiceIndex(index);
              setOptionIndex(0);
              setAddons([]);
            }}
          />
          <OptionPicker
            label={slug === "car-wash" ? "Vehicle size" : "Length"}
            options={service.options}
            value={optionIndex}
            onChange={setOptionIndex}
          />
          <AddonPicker
            idPrefix={`addon-${slug}`}
            addons={service.addons}
            value={addons}
            onChange={setAddons}
          />
          <ResourcePicker
            label={preview.resourceLabel}
            choices={preview.resourceChoices}
            value={resource}
            onChange={setResource}
          />
          <DateTimePicker
            label={times.reserved ? "Times reserved for medical card holders" : "Date and time"}
            days={days}
            dayIndex={dayIndex}
            onDayChange={setDayIndex}
            slots={times.slots}
            slot={times.slot}
            onSlotChange={setSlot}
          />
          <PreviewQuestions questions={preview.questions} />

          <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {service.name}
                {option ? ` · ${option.name}` : ""} ·{" "}
                <span className="tnum">{formatDuration(quote.durationMinutes)}</span>
              </span>
              <span className="tnum shrink-0 font-semibold">
                {quote.priceCents === 0 ? "Free" : formatMoney(quote.priceCents, "EUR")}
              </span>
            </div>
            <Button variant="primary" size="lg" block onClick={() => setBooked(true)}>
              {previewCta(service, quote.dueNowCents, booking)}
            </Button>
            <p className="text-center text-xs text-subtle-foreground">{preview.paymentNote}</p>
          </div>

          <BookedOverlay
            open={booked}
            title={confirmation.title}
            detail={confirmation.detail}
            booking={booking}
            onStartOver={() => setBooked(false)}
          />
        </div>
      </BrowserFrame>
    </BusinessThemeProvider>
  );
}
