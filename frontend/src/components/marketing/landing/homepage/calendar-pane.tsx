"use client";

import { useMemo } from "react";
import {
  Bell,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
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
import { RailEntry } from "@/components/shells/rail-item";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
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

/** How a calendar this size is laid out: a person per column that fits, and the afternoon filling the height. */
export function fitCalendar(width: number, height: number) {
  const phone = width > 0 && width < 560;
  return {
    phone,
    columns: width >= 760 ? 3 : width >= 560 ? 2 : 1,
    hourPx: phone ? CALENDAR_HOUR_PX_PHONE : Math.min(CALENDAR_HOUR_PX, fitHourPx(height)),
    narrow: width > 0 && width < 760,
  };
}

/** The app's rail on the sample business: its own items and classes. `active` is the item that's lit. */
export function Rail({ active = "calendar", alerts = 0 }: { active?: string; alerts?: number }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 bg-surface-sunken px-2 py-3 max-sm:hidden">
      <div className="mb-2 flex w-16 justify-center py-1">
        <BusinessTile name={LUMEN.name} color={LUMEN.branding.primaryColor} size="lg" className="size-9" />
      </div>
      <div className="flex flex-col gap-1">
        {RAIL.map((item) => (
          <RailEntry
            key={item.key}
            data-rail={item.key}
            item={item}
            label={item.vocabulary ? "Customers" : item.label}
            active={item.key === active}
          />
        ))}
      </div>
      <div className="flex-1" />
      <span className={cn(railClass, railIdle)}>
        <Search strokeWidth={1.75} />
        Search
      </span>
      <span className={cn(railClass, railIdle)}>
        <Bell strokeWidth={1.75} />
        Alerts
        {alerts > 0 && (
          <span className="absolute top-0.5 left-[calc(50%+0.25rem)] flex h-4 min-w-4 animate-pop-in items-center justify-center rounded-full bg-surface-raised px-1 text-[0.625rem] leading-none font-semibold text-foreground ring-1 ring-border-strong">
            {alerts}
          </span>
        )}
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
            <Button variant="secondary" size="sm" className="max-xl:hidden">
              <Users aria-hidden /> All people <ChevronDown />
            </Button>
          </>
        )}
        <span className="flex-1" />
        {!narrow && <ViewPill />}
        <Button variant="primary" size="sm" className="max-sm:hidden">
          <Plus /> New booking
        </Button>
      </div>
      <span className="sr-only">{count} bookings</span>
    </div>
  );
}

/**
 * The calendar's Day and Week as a picture. The sample never changes view, so this draws the same pill without the
 * real control, whose sliding thumb would bring the animation library to every visitor of the home page.
 */
function ViewPill() {
  const item = "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 [&_svg]:size-4";
  return (
    <span className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs font-medium pointer-coarse:h-11">
      <span className={cn(item, "bg-surface text-foreground shadow-sm dark:bg-border-strong")}>
        <Columns3 aria-hidden /> Day
      </span>
      <span className={cn(item, "text-muted-foreground")}>
        <CalendarRange aria-hidden /> Week
      </span>
    </span>
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
  nowMinute = NOW_MINUTES,
  lead,
}: {
  date: PlainDate;
  entries: DemoEntry[];
  /** How many people fit the width. */
  columns: number;
  phone: boolean;
  hourPx: number;
  /** Too narrow for the toolbar's view and day controls. */
  narrow: boolean;
  /** The now line, on a day that's today. */
  nowMinute?: number | null;
  /** Who a calendar with room for one person shows first. */
  lead?: string;
}) {
  const columns = useMemo<Columns>(
    () =>
      [...TEAM]
        .sort((a, b) => Number(b.id === lead) - Number(a.id === lead))
        .slice(0, shown)
        .map((resource) => ({
          key: resource.id,
          date,
          resource: phone ? { ...resource, name: resource.name.split(" ")[0] ?? resource.name } : resource,
          bookings: entries.filter((e) => e.who === resource.id).map((e) => toBooking(e, date)),
          open: openHours(resource.id),
          blocked: [],
          off: null,
        })),
    [date, entries, shown, lead, phone],
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
                nowMinute={nowMinute}
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
                    nowMinute={nowMinute}
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
