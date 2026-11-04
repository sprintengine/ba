/** The overview page's pure parts: today's bookings, the "Today" hint and the setup checklist. */
import type { Booking, ChecklistKey } from "@/lib/api/types";
import { isReleasedStatus } from "@/lib/status";
import type { VocabularyKey } from "@/lib/vocabulary";

type VFn = (key: VocabularyKey) => string;

/** Today's bookings that still stand (not cancelled or expired), in start order. */
export function todaysBookings(bookings: readonly Booking[]): Booking[] {
  // By instant: starts carry the business's offset, which changes when the clocks go back.
  return bookings
    .filter((b) => !isReleasedStatus(b.status))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** The first booking that hasn't started yet. */
export function nextBooking(bookings: readonly Booking[], now: Date): Booking | undefined {
  return bookings.find((b) => new Date(b.start) > now);
}

/**
 * The "Today" card's hint: approvals first, then the next start time, then whether the day is done or quiet.
 * `formatTime` renders an ISO instant in the business timezone.
 */
export function todayHint(
  bookings: readonly Booking[],
  now: Date,
  formatTime: (iso: string) => string,
): string {
  const pending = bookings.filter((b) => b.status === "pending_approval").length;
  if (pending > 0) return `${pending} need${pending === 1 ? "s" : ""} approval`;
  const next = nextBooking(bookings, now);
  if (next) return `Next at ${formatTime(next.start)}`;
  return bookings.length > 0 ? "All done for today" : "A quiet day";
}

/** The user's first name for the greeting, if they have one. */
export function firstName(name: string | null | undefined): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}

export type ChecklistStep = {
  label: string;
  hint: string;
  /** Dashboard path segment (see `dashboardHref`). */
  href: string;
  /** Only owners can do it (payments); others are told to ask the owner. */
  ownerOnly?: boolean;
};

/** What each setup step says and where it goes, in the business's vocabulary. */
export function checklistSteps(v: VFn): Record<ChecklistKey, ChecklistStep> {
  return {
    services: {
      label: "Add your services",
      hint: "What people can book, with prices and durations.",
      href: "services",
    },
    resources: {
      label: `Add ${v("resources")}`,
      hint: "The people, rooms or equipment you book.",
      href: "resources",
    },
    availability: {
      label: "Set your hours",
      hint: `When each ${v("resource")} can be booked.`,
      href: "resources",
    },
    payments: {
      label: "Connect payments",
      hint: "Take payment when people book. 0% platform fee.",
      href: "settings/payments",
      ownerOnly: true,
    },
    branding: { label: "Make it yours", hint: "Colour, logo and cover image.", href: "settings/branding" },
    publish: { label: "Publish your page", hint: "Go live and share your link.", href: "settings/general" },
  };
}

/** How far through setup the business is; `complete` when every step is done (or there are none). */
export function checklistProgress(items: readonly { done: boolean }[]): {
  done: number;
  total: number;
  percent: number;
  complete: boolean;
} {
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
    complete: done === total,
  };
}
