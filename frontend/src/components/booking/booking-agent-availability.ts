/**
 * Availability for the booking flow's WebMCP tools, fetched as the time step fetches it (whole months into the same
 * cache, or the next free time a month at a time), so what an agent is told is what the page then shows.
 */
import type { QueryClient } from "@tanstack/react-query";
import { publicApi } from "@/lib/api/public";
import { qk } from "@/lib/api/query-keys";
import type { AvailabilityDay, PublicBusiness, PublicService, Slot } from "@/lib/api/types";
import { afterToRefind } from "@/lib/booking/next-slot";
import { availabilityQuery, type Selection } from "@/lib/booking/selection";
import { maxBookableDate, monthWindows } from "@/lib/booking/windows";
import { monthEnd, monthStart, todayInTz, zonedToIso, type PlainDate } from "@/lib/format";

type Query = ReturnType<typeof availabilityQuery>;

/** The days from `from` to `to`, loaded a whole month at a time. `fresh` refetches rather than trust the cache. */
export async function monthDays(
  queryClient: QueryClient,
  slug: string,
  query: Query,
  { from, to, today, max }: { from: PlainDate; to: PlainDate; today: PlainDate; max: PlainDate },
  fresh = false,
): Promise<AvailabilityDay[]> {
  const responses = await Promise.all(
    monthWindows(monthStart(from), monthEnd(to), today, max).map((w) => {
      const q = { ...query, from: w.from, to: w.to };
      return queryClient.query({
        queryKey: qk.public.availability(slug, q),
        queryFn: ({ signal }) => publicApi.availability(slug, q, { signal }),
        staleTime: fresh ? 0 : 30_000,
      });
    }),
  );
  return responses.flatMap((r) => r.days);
}

/** For a business that offers its next available time only: the first free time from `start` (after `after`). */
export async function nextSlot(
  slug: string,
  query: Query,
  { start, max, after }: { start: PlainDate; max: PlainDate; after: string | null },
  signal: AbortSignal,
): Promise<Slot | null> {
  for (const w of monthWindows(start, max, start, max)) {
    const r = await publicApi.availability(slug, { ...query, ...w, after }, { signal });
    const slot = r.days.flatMap((d) => d.slots)[0];
    if (slot) return slot;
  }
  return null;
}

/** The slot at the selection's date and time if it is free right now (asked afresh, not from the cache). */
export async function freeSlot(
  queryClient: QueryClient,
  business: PublicBusiness,
  service: PublicService,
  sel: Selection,
  signal: AbortSignal,
): Promise<Slot | null> {
  if (!sel.date || !sel.time) return null;
  const tz = business.timezone;
  const query = availabilityQuery(sel, service);
  const at = new Date(zonedToIso(sel.date, sel.time, tz)).getTime();
  const isChosen = (s: Slot) => new Date(s.start).getTime() === at;
  if (business.policies.nextAvailableOnly) {
    const after = afterToRefind(sel.date, sel.time, tz);
    const r = await publicApi.availability(
      business.slug,
      { ...query, from: sel.date, to: sel.date, after },
      { signal },
    );
    const next = r.days.flatMap((d) => d.slots)[0];
    return next && isChosen(next) ? next : null;
  }
  const today = todayInTz(tz);
  const max = maxBookableDate(today, service, business.policies);
  const days = await monthDays(
    queryClient,
    business.slug,
    query,
    { from: sel.date, to: sel.date, today, max },
    true,
  );
  return days.find((d) => d.date === sel.date)?.slots.find(isChosen) ?? null;
}
