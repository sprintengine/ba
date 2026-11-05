"use client";

import { useMemo } from "react";
import {
  Bell,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { formatDate, formatTime, minutesToTime, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarHeaderRow } from "@/components/dashboard/calendar/calendar-headers";
import { DayColumn, TimeGutter } from "@/components/dashboard/calendar/calendar-grid";
import { BusinessTile } from "@/components/shells/business-tile";
import { railClass, railIdle, railItemsFor } from "@/components/shells/dashboard-nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  FIRST_HOUR,
  LAST_HOUR,
  LUMEN,
  NOW_MINUTES,
  openHours,
  TEAM,
  toBooking,
  type DemoEntry,
} from "./fixture";

type Columns = React.ComponentProps<typeof CalendarHeaderRow>["columns"];

const RAIL = railItemsFor("owner", false);
const noop = () => undefined;
const time = (iso: string) => formatTime(iso, LUMEN.timezone, LUMEN.locale);
const hour = (h: number) => minutesToTime(h * 60);
/** Vertical scale here: the app's day view zoomed out, so the afternoon fits one window. */
export const CALENDAR_HOUR_PX = 110;
export const CALENDAR_HOUR_PX_PHONE = 80;
/** A phone has room for a stretch of the afternoon. It opens at 14:30, on a whole booking, above the demo's. */
const PHONE_SCROLLED_HOURS = 1.5;
/** The toolbar, the names and the foot, around the hours. */
const CHROME_PX = 168;

/** The hour height at which the whole afternoon fits a calendar this tall. */
export const fitHourPx = (height: number) => Math.floor((height - CHROME_PX) / (LAST_HOUR - FIRST_HOUR));

/** The app's rail, drawn from its own items and classes. */
function Rail() {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 bg-surface-sunken px-2 py-3 max-sm:hidden">
      <div className="mb-2 flex w-16 justify-center py-1">
        <BusinessTile name={LUMEN.name} color={LUMEN.branding.primaryColor} size="lg" className="size-9" />
      </div>
      <div className="flex flex-col gap-1">
        {RAIL.map((item) => {
          const active = item.key === "calendar";
          return (
            <span
              key={item.key}
              className={cn(railClass, active ? "bg-background font-semibold text-foreground" : railIdle)}
            >
              <item.icon strokeWidth={active ? 2.25 : 1.75} />
              <span className="max-w-full truncate">{item.vocabulary ? "Customers" : item.label}</span>
            </span>
          );
        })}
      </div>
      <div className="flex-1" />
      <span className={cn(railClass, railIdle)}>
        <Search strokeWidth={1.75} />
        Search
      </span>
      <span className={cn(railClass, railIdle)}>
        <Bell strokeWidth={1.75} />
        Alerts
      </span>
      <Avatar name="Dana Owens" className="mt-1 size-7 text-2xs" />
    </div>
  );
}

/** The app's toolbar, with its own controls in the same places. */
function Toolbar({ date, count, narrow }: { date: PlainDate; count: number; narrow: boolean }) {
  const title = formatDate(date, LUMEN.timezone, "long", LUMEN.locale);
  return (
    <div className="flex flex-col gap-2 px-5 pt-3 pb-2.5 max-sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="-ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[1.375rem] leading-8 font-semibold tracking-tight whitespace-nowrap max-sm:text-lg">
          {title}
          <ChevronDown aria-hidden className="size-4 text-subtle-foreground" />
        </span>
        {!narrow && (
          <>
            <span className="flex items-center">
              <IconButton label="Previous day" tooltip={false}>
                <ChevronLeft />
              </IconButton>
              <IconButton label="Next day" tooltip={false}>
                <ChevronRight />
              </IconButton>
            </span>
            <Button variant="secondary" size="sm" disabled>
              Today
            </Button>
          </>
        )}
        <span className="flex-1" />
        {!narrow && (
          <SegmentedControl
            size="sm"
            aria-label="Calendar view"
            value="day"
            onValueChange={noop}
            options={[
              { value: "day", label: "Day", icon: <Columns3 aria-hidden /> },
              { value: "week", label: "Week", icon: <CalendarRange aria-hidden /> },
            ]}
          />
        )}
        <Button variant="primary" size="sm" className="max-sm:hidden">
          <Plus /> New booking
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2 max-sm:hidden">
        <Button variant="secondary" size="sm">
          <Users aria-hidden /> All people <ChevronDown />
        </Button>
        <span className="flex-1" />
        <span className="flex h-8 items-center gap-2 px-2 text-sm text-muted-foreground">
          <Switch size="sm" checked={false} aria-label="Cancelled" />
          Cancelled
        </span>
        <Button variant="secondary" size="sm">
          <List aria-hidden /> All bookings
        </Button>
      </div>
      <span className="sr-only">{count} bookings</span>
    </div>
  );
}

/** The foot of the calendar: the count, the place and the legend. */
function Footer({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-1.5 text-xs text-muted-foreground max-sm:hidden">
      <span className="tnum">
        {count} bookings · {LUMEN.timezone.split("/").at(-1)}
      </span>
      <span className="flex gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-muted ring-1 ring-border" />
          Not working
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 3px)",
            }}
          />
          Preparation time
        </span>
      </span>
    </div>
  );
}

/**
 * The real calendar on the sample business: its header row, time gutter, day columns and booking cards, fed by the
 * fixture. Only the frame around them is drawn here, because the app's rail and toolbar need a signed-in business.
 */
export function CalendarPane({
  date,
  entries,
  columns: shown,
  phone,
  hourPx,
  narrow,
}: {
  date: PlainDate;
  entries: DemoEntry[];
  /** How many people fit the width. */
  columns: number;
  phone: boolean;
  hourPx: number;
  /** Too narrow for the toolbar's view and day controls. */
  narrow: boolean;
}) {
  const columns = useMemo<Columns>(
    () =>
      TEAM.slice(0, shown).map((resource) => ({
        key: resource.id,
        date,
        resource,
        bookings: entries.filter((e) => e.who === resource.id).map((e) => toBooking(e, date)),
        open: openHours(resource.id),
        blocked: [],
        off: null,
      })),
    [date, entries, shown],
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <Toolbar date={date} count={entries.length} narrow={narrow} />
        <div className="@container min-h-0 flex-1 overflow-hidden border-t border-border">
          <div className="relative z-40">
            <CalendarHeaderRow columns={columns} view="day" today={date} loading={false} onOpenDay={noop} />
          </div>
          <div className="flex" style={{ marginTop: phone ? -PHONE_SCROLLED_HOURS * hourPx : 0 }}>
            <div className="sticky left-0 z-30 bg-background">
              <TimeGutter
                startHour={FIRST_HOUR}
                endHour={LAST_HOUR}
                formatHour={hour}
                nowMinute={NOW_MINUTES}
                hourPx={hourPx}
              />
            </div>
            <div className="flex min-w-0 flex-1">
              {columns.map((c) => (
                <div key={c.key} className="flex min-w-0 flex-1">
                  <DayColumn
                    date={c.date}
                    timeZone={LUMEN.timezone}
                    bookings={c.bookings}
                    open={c.open}
                    startHour={FIRST_HOUR}
                    endHour={LAST_HOUR}
                    nowMinute={NOW_MINUTES}
                    blocked={c.blocked}
                    formatTime={time}
                    onSelectBooking={noop}
                    resourceId={c.key}
                    hourPx={hourPx}
                    label={c.resource?.name ?? ""}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <Footer count={entries.length} />
      </div>
    </div>
  );
}
