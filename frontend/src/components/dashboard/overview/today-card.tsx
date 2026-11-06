"use client";

import { useState } from "react";
import { AppLink } from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Plus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { useBookings } from "@/lib/api/hooks";
import { groupSessions } from "@/lib/dashboard/calendar-layout";
import { addDaysToPlainDate } from "@/lib/format";
import { todayInTz, toPlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingExceptions } from "@/components/ui/status-badge";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";
import { serviceTint } from "../calendar/event-card";

/**
 * The day's running order: today's bookings as the calendar's cards in small, what's ahead first, finished ones folded
 * into a line above, the now line between them. When the day is over it says so and shows the next day's first ones.
 */
const NEXT_DAY_ROWS = 3;

export function TodayCard({ bookings, loading, now }: { bookings: Booking[]; loading: boolean; now: Date }) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { openBooking, openNewBooking } = useBookingActions();
  const business = useCurrentBusiness();
  const router = useRouter();
  const calendarAt = `/dashboard/${business.slug}/calendar`;
  const [showDone, setShowDone] = useState(false);
  const open = (session: Session) =>
    session.bookings.length > 1 ? router.push(calendarAt) : openBooking(session.bookings[0].id);
  const done = bookings.filter((b) => new Date(b.end) <= now);
  // A class's attendees are one line: six identical rows would say less than "6 booked".
  const shown = groupSessions(showDone ? bookings : bookings.filter((b) => new Date(b.end) > now));
  const nowIndex = shown.findIndex((b) => new Date(b.start) > now);
  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2}>Today&apos;s {v("bookings")}</CardTitle>
        <CardAction>
          <Button asChild variant="link" size="xs" className="text-xs">
            <AppLink href={`/dashboard/${business.slug}/bookings`}>All {v("bookings")}</AppLink>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-2 pb-3">
        {loading ? (
          <div className="flex flex-col px-2" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex h-15 items-center gap-3">
                <Skeleton className="h-4 w-11" />
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<CalendarDays />}
            title={`Nothing booked today`}
            description={`New ${v("bookings")} show up here as they come in.`}
            action={
              <Button size="sm" variant="secondary" onClick={() => openNewBooking()}>
                <Plus /> New {v("booking")}
              </Button>
            }
          />
        ) : (
          <ol className="flex flex-col gap-1.5 px-2">
            {done.length > 0 && (
              <li>
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => setShowDone((o) => !o)}
                  className="flex min-h-9 w-full items-center gap-1.5 rounded-lg text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn("size-4 transition-transform", showDone && "rotate-180")}
                  />
                  {done.length} finished earlier today
                </button>
              </li>
            )}
            {shown.map((session, i) => (
              <li key={session.id}>
                {i === nowIndex && i > 0 && <NowDivider label={`Now · ${fmt.time(now.toISOString())}`} />}
                <OrderRow session={session} now={now} onOpen={open} />
              </li>
            ))}
          </ol>
        )}
        {!loading && shown.length === 0 && (
          <DayAfter dayIsOver={bookings.length > 0} now={now} onOpen={open} />
        )}
      </CardContent>
    </Card>
  );
}

/** With nothing left today: the day is over, and the next day with bookings, its first few in order. */
function DayAfter({
  dayIsOver,
  now,
  onOpen,
}: {
  dayIsOver: boolean;
  now: Date;
  onOpen: (session: Session) => void;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const business = useCurrentBusiness();
  const tomorrow = addDaysToPlainDate(todayInTz(business.timezone, now), 1);
  const later = useBookings(business.id, { from: tomorrow, limit: 12 });
  const items = later.data?.items ?? [];
  const day = items[0] && toPlainDate(items[0].start, business.timezone);
  const onDay = items.filter((b) => toPlainDate(b.start, business.timezone) === day);
  const sessions = groupSessions(onDay).slice(0, NEXT_DAY_ROWS);
  const first = sessions[0]?.bookings[0];
  if (!dayIsOver && !first) return null;
  return (
    <div className="flex flex-col gap-1.5 px-2 pt-3">
      {dayIsOver && <p className="text-sm font-medium">That&rsquo;s the day.</p>}
      {first && day && (
        <>
          <p className="tnum text-sm text-muted-foreground">
            {day === tomorrow ? "Tomorrow" : fmt.date(day, "dayMonth")}: {onDay.length}{" "}
            {v("booking", { count: onDay.length })}, first at {fmt.time(first.start)}
          </p>
          <ol className="mt-1 flex flex-col gap-1.5">
            {sessions.map((session) => (
              <li key={session.id}>
                <OrderRow session={session} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

type Session = ReturnType<typeof groupSessions<Booking>>[number];

/** One line of the running order: its time, then a card in the service's tint, as on the calendar. */
function OrderRow({
  session,
  now,
  onOpen,
}: {
  session: Session;
  now: Date;
  onOpen: (session: Session) => void;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const [b, ...rest] = session.bookings;
  const past = new Date(b.end) <= now;
  // As on the calendar, only a booking that stands wears its service's colour; a status badge can't be read over it.
  const standing = !past && !["cancelled", "expired", "no_show"].includes(b.status);
  const group = rest.length > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className="group flex w-full items-center gap-3 rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* Past ones are marked by a muted time and a plain card, not a faded row (that drops the text below 4.5:1). */}
      <span className={cn("tnum w-11 shrink-0 text-sm font-medium", past && "text-muted-foreground")}>
        {fmt.time(b.start)}
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 transition-[filter] group-hover:brightness-[0.97] dark:group-hover:brightness-125",
          !standing && "border-border-subtle bg-surface-sunken",
        )}
        style={standing ? serviceTint(b.service.color) : undefined}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{group ? b.service.name : b.customer.name}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {group ? `${rest.length + 1} ${v("booking", { count: rest.length + 1 })}` : b.service.name}
            {!group && b.option ? ` · ${b.option.name}` : ""}
            {b.resources.length ? ` · ${b.resources.map((r) => r.name).join(", ")}` : ""}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <BookingExceptions status={b.status} />
        </span>
      </span>
    </button>
  );
}

function NowDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pb-1.5" aria-hidden>
      <span className="tnum rounded-full bg-danger px-1.5 py-0.5 text-2xs font-semibold text-white">
        {label}
      </span>
      <span className="h-px flex-1 bg-danger/50" />
    </div>
  );
}
