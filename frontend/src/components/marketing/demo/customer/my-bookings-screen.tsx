"use client";

import { CalendarClock, CalendarPlus, CalendarX2, Clock, MapPin, Plug, Plus, UserRound } from "lucide-react";
import type { BookingStatus, PaymentStatus } from "@/lib/api/types";
import { bookingEnd } from "@/lib/booking/booking";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import {
  addDaysToPlainDate,
  formatDate,
  formatDuration,
  formatTimeRange,
  zonedToIso,
  type PlainDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { BusinessTile } from "@/components/shells/business-tile";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { useDemoTarget } from "../engine/demo-context";
import { BOOKED_TIME, demoDates } from "./state";

/*
 * My bookings (`/my/bookings`) for the visitor once they've made an account: MinimalShell's header and
 * components/booking/{my-bookings,my-booking-card,date-tile}.tsx, every booking in its business's colour.
 */

const TZ = "Europe/Dublin";

type Row = {
  id: string;
  business: string;
  color: string;
  service: string;
  option?: string;
  date: PlainDate;
  time: string;
  minutes: number;
  people: string;
  place: string;
  status: BookingStatus;
  payment: PaymentStatus;
};

function rows(today: PlainDate): { upcoming: Row[]; past: Row[] } {
  const booked = demoDates(today).booked;
  const lumen = { business: "Lumen Physiotherapy", color: "#5b4ae0", place: "Unit 4, Lantern Quay, Dublin" };
  const gleam = { business: "Gleam Car Wash", color: "#0369a1", place: "Orchard Business Park, Cork" };
  const cadence = { business: "Cadence Music Studio", color: "#7c3aed", place: "7 Tuning Fork Lane, Galway" };
  const done = { status: "completed", payment: "paid" } as const;
  const upcoming = { status: "confirmed", payment: "paid" } as const;
  return {
    upcoming: [
      {
        id: "lumen",
        ...lumen,
        ...upcoming,
        service: "Initial assessment",
        date: booked,
        time: BOOKED_TIME,
        minutes: 60,
        people: "Sam Rivers · Treatment room 2",
      },
      {
        id: "gleam",
        ...gleam,
        ...upcoming,
        service: "Full valet",
        option: "Small car",
        date: addDaysToPlainDate(booked, 3),
        time: "16:00",
        minutes: 90,
        people: "Bay 1",
      },
      {
        id: "cadence",
        ...cadence,
        ...upcoming,
        service: "Lesson",
        option: "30 minutes",
        date: addDaysToPlainDate(booked, 4),
        time: "11:45",
        minutes: 30,
        people: "Taylor Quinn · Practice room",
      },
    ],
    past: [
      {
        id: "cadence-past",
        ...cadence,
        ...done,
        service: "Lesson",
        option: "30 minutes",
        date: addDaysToPlainDate(today, -9),
        time: "19:00",
        minutes: 30,
        people: "Taylor Quinn · Practice room",
      },
      {
        id: "gleam-past",
        ...gleam,
        ...done,
        service: "Full valet",
        option: "Small car",
        date: addDaysToPlainDate(today, -26),
        time: "09:00",
        minutes: 90,
        people: "Bay 1",
      },
    ],
  };
}

function DateTile({ date, muted }: { date: PlainDate; muted: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex w-14 shrink-0 flex-col items-center self-start overflow-hidden rounded-xl border border-border text-center",
        muted && "opacity-60",
      )}
    >
      <span className="w-full bg-primary py-0.5 text-2xs font-semibold tracking-wide text-primary-foreground uppercase">
        {formatDate(date, TZ, "weekday")}
      </span>
      <span className="tnum pt-0.5 text-xl font-semibold">{Number(date.slice(8))}</span>
      <span className="pb-1 text-2xs text-muted-foreground uppercase">
        {formatDate(date, TZ, "short").split(" ")[1]}
      </span>
    </div>
  );
}

function BookingCard({ b, past }: { b: Row; past: boolean }) {
  const start = zonedToIso(b.date, b.time, TZ);
  const finish = bookingEnd(start, b.minutes);
  return (
    <BusinessThemeProvider primaryColor={b.color}>
      <article
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xs dark:bg-surface-raised",
          past && "bg-surface/60",
        )}
      >
        <div className="flex gap-4 p-4">
          <DateTile date={b.date} muted={past} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <BusinessTile name={b.business} logoUrl={null} color={b.color} size="sm" />
                <span className="truncate">{b.business}</span>
              </span>
              <span className="flex w-full flex-wrap gap-1.5">
                <BookingStatusBadge status={b.status} />
                <PaymentStatusBadge status={b.payment} />
              </span>
            </div>
            <h3 className="text-base font-semibold tracking-tight">
              {b.service}
              {b.option && <span className="font-normal text-muted-foreground"> · {b.option}</span>}
            </h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <li className="tnum flex items-start gap-1.5">
                <Clock className="mt-[3px] size-3.5 shrink-0" aria-hidden />
                <span>
                  {formatDate(b.date, TZ, "dayMonth")} · {formatTimeRange(start, finish, TZ)}{" "}
                  <span className="text-subtle-foreground">({formatDuration(b.minutes)})</span>
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                <UserRound className="size-3.5" aria-hidden /> {b.people}
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden /> {b.place}
              </li>
            </ul>
          </div>
        </div>
        {past ? (
          <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-2.5">
            <Button variant="ghost" size="sm" tabIndex={-1}>
              Book again
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1 border-t border-border-subtle bg-surface-sunken/60 px-3 py-2.5">
            <Button variant="ghost" tabIndex={-1} className="h-8 px-2.5">
              <CalendarPlus /> Calendar
            </Button>
            <Button variant="ghost" tabIndex={-1} className="h-8 px-2.5">
              <CalendarClock /> Reschedule
            </Button>
            <Button variant="danger-ghost" tabIndex={-1} className="ml-auto h-8 px-2.5">
              <CalendarX2 /> Cancel
            </Button>
          </div>
        )}
      </article>
    </BusinessThemeProvider>
  );
}

function Tab({ id, label, count, active }: { id: string; label: string; count: number; active: boolean }) {
  const t = useDemoTarget(id);
  return (
    <span
      {...t.props}
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center justify-center gap-1.5 border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
        (active || t.pressed) && "border-foreground text-foreground",
      )}
    >
      {label}{" "}
      <span className="tnum ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{count}</span>
    </span>
  );
}

export function MyBookingsScreen({ today, past }: { today: PlainDate; past: boolean }) {
  const all = rows(today);
  const items = past ? all.past : all.upcoming;
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <Avatar name="Jordan Pike" size="md" />
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div className="flex flex-col gap-4 pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">My bookings</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Everything you&apos;ve booked on bookanything, in one place.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="ghost" tabIndex={-1}>
                <Plug /> Connected apps
              </Button>
              <Button variant="primary" tabIndex={-1}>
                <Plus /> Book something new
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 border-b border-border">
          <Tab id="tab-upcoming" label="Upcoming" count={all.upcoming.length} active={!past} />
          <Tab id="tab-past" label="Past" count={all.past.length} active={past} />
        </div>
        <ul key={String(past)} className="flex animate-fade-in flex-col gap-3 pt-6">
          {items.map((b) => (
            <li key={b.id}>
              <BookingCard b={b} past={past} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
