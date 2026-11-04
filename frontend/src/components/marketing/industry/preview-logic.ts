import { addDaysToPlainDate, formatDate, formatMoney, type PlainDate } from "@/lib/format";
import { demoIsOpen } from "../demo-schedule";
import type { ExampleService, IndustryContent } from "../industries/types";

/** Next [count] bookable days after [today] (demo schedule). */
export function nextOpenDays(today: PlainDate, count: number): PlainDate[] {
  const days: PlainDate[] = [];
  for (let d = addDaysToPlainDate(today, 1); days.length < count; d = addDaysToPlainDate(d, 1)) {
    if (demoIsOpen(d, today)) days.push(d);
  }
  return days;
}

/**
 * The preview's services for the chosen customer group: any group but the first hides restricted services (music:
 * the trial is for new students only).
 */
export function visiblePreviewServices(
  content: IndustryContent,
  group: number,
): { index: number; service: ExampleService }[] {
  const { preview, services } = content;
  return preview.serviceIndexes.flatMap((index) => {
    const service = services[index];
    if (!service || (service.restriction && preview.groups && group !== 0)) return [];
    return [{ index, service }];
  });
}

/** The book button: what is paid now, or what is booked when nothing is. */
export function previewCta(service: ExampleService, dueNowCents: number, booking: string): string {
  switch (service.paymentMode) {
    case "free":
      return `Book free ${service.name.toLowerCase()}`;
    case "deposit":
      return `Pay ${formatMoney(dueNowCents, "EUR")} deposit`;
    case "at_venue":
      return `Book ${booking.toLowerCase()}`;
    case "full":
      return `Pay ${formatMoney(dueNowCents, "EUR")} and book`;
  }
}

/**
 * The times on offer: the GP's medical card holders (second group) only see the reserved morning windows. The
 * selected time falls back to the second one when the chosen time isn't on offer.
 */
export function previewTimes(
  content: IndustryContent,
  group: number,
  picked: string | null,
): { reserved: boolean; slots: string[]; slot: string | undefined } {
  const reserved = content.slug === "gp-practice" && group === 1;
  const slots = reserved ? content.preview.slots.slice(0, 3) : content.preview.slots;
  return { reserved, slots, slot: picked && slots.includes(picked) ? picked : slots[1] };
}

/** The confirmation after "booking": checkout next for paid services, else confirmed; then what and when. */
export function bookedSummary(
  service: ExampleService,
  day: PlainDate | undefined,
  slot: string | undefined,
  booking: string,
): { title: string; detail: string } {
  const paid = service.paymentMode === "full" || service.paymentMode === "deposit";
  const when = day ? ` · ${formatDate(day, "UTC", "long")}` : "";
  return {
    title: paid ? "Next: secure checkout" : `${booking} confirmed`,
    detail: `${service.name}${when} at ${slot ?? ""}`,
  };
}
