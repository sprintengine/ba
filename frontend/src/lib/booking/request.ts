/** The public booking request built from the flow's selection and the details form. Pure. */
import type { CreatePublicBooking, PublicService } from "@/lib/api/types";
import { zonedToIso } from "@/lib/format/datetime";
import { answersPayload, type DetailsValues, type Question } from "./details-schema";
import { selectedResourceId, type Selection } from "./selection";

/** The request body, or null while no time is chosen. Text is trimmed; blank phone and notes are null. */
export function bookingRequest({
  service,
  selection: sel,
  details,
  questions,
  timeZone,
  returnUrl,
  payAtVenue = false,
  expectedTotalCents,
}: {
  service: PublicService;
  selection: Selection;
  details: DetailsValues;
  questions: Question[];
  timeZone: string;
  /** This site's origin, for the payment provider's success and cancel links. */
  returnUrl: string;
  /** The customer chose to pay at the venue (a service with `allowPayAtVenue`). */
  payAtVenue?: boolean;
  /**
   * The total shown on the review step (`Quote.totalCents`, with the time's deal): the booking is refused with
   * PRICE_CHANGED rather than made at another price.
   */
  expectedTotalCents?: number;
}): CreatePublicBooking | null {
  if (!sel.date || !sel.time) return null;
  return {
    serviceId: service.id,
    optionId: sel.optionId,
    addonIds: sel.addonIds,
    groupId: sel.groupId,
    resourceId: selectedResourceId(sel, service),
    start: zonedToIso(sel.date, sel.time, timeZone),
    customer: { name: details.name.trim(), email: details.email.trim(), phone: details.phone.trim() || null },
    answers: answersPayload(details, questions),
    customerNotes: details.notes.trim() || null,
    returnUrl,
    payment: payAtVenue ? "at_venue" : undefined,
    expectedTotalCents,
  };
}
