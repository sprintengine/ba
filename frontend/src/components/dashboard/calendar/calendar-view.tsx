"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import type { BlockedInterval } from "@/lib/availability/windows";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { minutesToTime, timeToMinutes, toTimeOfDay, todayInTz, type PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/hooks/use-now";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";
import { CalendarReleases } from "../releases/lazy-releases";
import { CLOSED_FILL, PREPARATION_HATCH } from "./blocked-band";
import { DayColumn, TimeGutter } from "./calendar-grid";
import { CalendarHeaderRow, colMin } from "./calendar-headers";
import { CalendarToolbar } from "./calendar-toolbar";
import { hourPx } from "./grid-scale";
import { useCalendarZoom } from "./use-calendar-zoom";

/** The time gutter's width (`w-14`): the columns scroll under it. */
const HOUR_GUTTER_PX = 56;
import { useCalendarData } from "./use-calendar-data";
import { useCalendarKeyboard } from "./use-calendar-keyboard";
import { useCalendarUrl } from "./use-calendar-url";

const formatHour = (h: number) => (h === 24 ? "" : minutesToTime(h * 60));

/** Resource calendar: resources as columns (day) or days as columns (week), in the business timezone. */
export function CalendarView() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const now = useNow(60_000);
  const { openBooking, openNewBooking } = useBookingActions();
  const today = todayInTz(business.timezone, now);
  const url = useCalendarUrl(today);
  const { date, view, setParams, go } = url;
  const data = useCalendarData(url);
  const { columns, selected, startHour, endHour } = data;
  const [zoom, setZoom] = useCalendarZoom();
  // The grid's own height, measured below, is what Fit the day fits into.
  const [gridHeight, setGridHeight] = useState(0);
  const shortestMinutes = useMemo(
    () =>
      Math.min(
        ...columns.flatMap((c) =>
          c.bookings.map((b) => (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000),
        ),
        60,
      ),
    [columns],
  );
  const scale = hourPx(view, zoom, { available: gridHeight, hours: endHour - startHour, shortestMinutes });
  const nowMinute = timeToMinutes(toTimeOfDay(now, business.timezone));

  const newBooking = useCallback(
    () => openNewBooking({ date, resourceId: selected?.id }),
    [openNewBooking, date, selected],
  );
  useCalendarKeyboard({ go, setParams, onNew: newBooking });
  // Stable across renders so the memoised columns only re-render when their own bookings or hours change.
  const createAt = useCallback(
    (d: PlainDate, minute: number, resourceId: string | undefined) =>
      openNewBooking({ date: d, time: minutesToTime(minute), resourceId: resourceId ?? selected?.id }),
    [openNewBooking, selected],
  );

  // Scroll to "now" (or opening time) when the day changes.
  const scroller = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const [position, setPosition] = useState<string | null>(null);
  const count = columns.length;
  const syncMoreRight = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    const width = count > 0 ? (el.scrollWidth - HOUR_GUTTER_PX) / count : 0;
    const fits =
      width > 0 ? Math.max(1, Math.floor((el.clientWidth - HOUR_GUTTER_PX) / width + 0.05)) : count;
    const first = width > 0 ? Math.min(count - fits, Math.round(el.scrollLeft / width)) : 0;
    setPosition(fits < count ? `${first + 1}–${first + fits} of ${count}` : null);
  }, [count]);
  const { ready, days, firstOpen } = data;
  useEffect(() => {
    const key = `${view}-${date}`;
    if (!ready || !scroller.current || scrolledFor.current === key) return;
    scrolledFor.current = key;
    // Before opening time, today starts at the working day too, not on empty hours.
    // Any other day starts at its first booking, so a busy day never opens on empty rows.
    const starts = columns.flatMap((c) =>
      c.bookings.map((b) => timeToMinutes(toTimeOfDay(b.start, business.timezone))),
    );
    const firstBusy = starts.length > 0 ? Math.min(...starts) : firstOpen;
    // Once today's last booking is over there's nothing ahead to look at: today opens as any other day does.
    const lastEnd = Math.max(
      0,
      ...columns.flatMap((c) => c.bookings.map((b) => timeToMinutes(toTimeOfDay(b.end, business.timezone)))),
    );
    const live = days.includes(today) && nowMinute < lastEnd;
    const target = live ? Math.max(firstOpen - 15, nowMinute - 45) : firstBusy - 15;
    scroller.current.scrollTop = Math.max(0, ((target - startHour * 60) / 60) * scale);
    // Where the week doesn't fit, it opens on today rather than on Monday.
    const column = view === "week" ? scroller.current.querySelector(`[data-day="${today}"]`) : null;
    if (column instanceof HTMLElement) scroller.current.scrollLeft = column.offsetLeft - HOUR_GUTTER_PX;
    syncMoreRight();
  }, [
    ready,
    view,
    date,
    days,
    today,
    nowMinute,
    firstOpen,
    startHour,
    columns,
    business.timezone,
    scale,
    syncMoreRight,
  ]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      syncMoreRight();
      setGridHeight(el.clientHeight - (pinned.current?.offsetHeight ?? 0));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    if (pinned.current) observer.observe(pinned.current);
    return () => observer.disconnect();
  }, [syncMoreRight, ready]);
  // A new scale keeps the same time at the top of the window.
  const scaleShown = useRef(scale);
  useEffect(() => {
    const el = scroller.current;
    if (el && scaleShown.current !== scale) el.scrollTop *= scale / scaleShown.current;
    scaleShown.current = scale;
  }, [scale]);
  // Bookings keep their text in view just under the pinned rows, however tall those are today.
  useEffect(() => {
    const el = pinned.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      scroller.current?.style.setProperty("--calendar-top", `${el.clientHeight}px`),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  const { loading } = data;

  return (
    <PageContainer size="full" className="flex h-full min-h-0 flex-col">
      {/* The toolbar's date is the visible title; the page still needs a top-level heading. */}
      <h1 className="sr-only">Calendar</h1>
      <CalendarToolbar
        date={date}
        view={view}
        today={today}
        range={data}
        resources={data.resources}
        resourcesLoading={data.resourcesQ.isPending}
        choice={data.choice}
        shown={data.shown}
        position={view === "day" ? position : null}
        waiting={data.waiting}
        showCancelled={url.showCancelled}
        zoom={zoom}
        onZoom={setZoom}
        setParams={setParams}
        go={go}
        onNew={newBooking}
      />

      {data.error ? (
        <div className="px-4 sm:px-5">
          <ErrorState error={data.error} onRetry={data.refetch} headingLevel={2} />
        </div>
      ) : !data.resourcesQ.isPending && data.resources.length === 0 ? (
        <EmptyState
          headingLevel={2}
          icon={<CalendarPlus />}
          title={`No ${v("resources")} yet`}
          description={`The calendar shows one column per ${v("resource")}. Add your first one to start taking ${v("bookings")}.`}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col border-t border-border">
          <div className="relative min-h-0 flex-1">
            <div
              ref={scroller}
              onScroll={syncMoreRight}
              // Keyboard users scroll the grid too (it is a scroll container, not just its content).
              tabIndex={0}
              role="region"
              aria-label="Calendar"
              className="@container relative h-full snap-x scroll-pl-14 scrollbar-thin overflow-auto overscroll-contain"
            >
              <div className="flex min-w-full" style={{ width: "max-content" }}>
                <div className="flex min-w-full flex-col">
                  {/* Names and release chips stay pinned over the scrolling day, times beside it. */}
                  <div ref={pinned} className="sticky top-0 z-40">
                    <CalendarHeaderRow
                      columns={columns}
                      view={view}
                      today={today}
                      loading={data.resourcesQ.isPending}
                      onOpenDay={(d) => setParams({ view: null, date: d })}
                    />
                    <CalendarReleases days={days} view={view} today={today} columnClass={colMin(view)} />
                  </div>
                  {/* Grid (dimmed while a new day or week loads over the previous one's bookings) */}
                  <div
                    className={cn("flex transition-opacity", data.updating && "opacity-60")}
                    aria-busy={data.updating || undefined}
                  >
                    <div className="sticky left-0 z-30 bg-background">
                      <TimeGutter
                        startHour={startHour}
                        endHour={endHour}
                        formatHour={formatHour}
                        nowMinute={days.includes(today) ? nowMinute : null}
                        hourPx={scale}
                      />
                    </div>
                    {loading
                      ? Array.from({ length: Math.max(columns.length, 3) }, (_, i) => (
                          <div
                            key={i}
                            className={cn("flex-1 border-l border-border p-2", colMin(view))}
                            style={{ height: (endHour - startHour) * scale }}
                          >
                            <Skeleton className="mt-16 h-24 w-full rounded-lg" />
                            <Skeleton className="mt-24 h-36 w-5/6 rounded-lg" />
                          </div>
                        ))
                      : columns.map((c) => (
                          <div key={c.key} data-day={c.date} className={cn("flex flex-1", colMin(view))}>
                            <DayColumn
                              date={c.date}
                              timeZone={business.timezone}
                              bookings={c.bookings}
                              open={c.open}
                              startHour={startHour}
                              endHour={endHour}
                              nowMinute={days.includes(today) ? nowMinute : null}
                              nowFaint={c.date !== today}
                              blocked={c.blocked}
                              compact={view === "week"}
                              formatTime={fmt.time}
                              onSelectBooking={openBooking}
                              onCreate={createAt}
                              resourceId={c.resource?.id}
                              hourPx={scale}
                              label={
                                c.resource
                                  ? `${c.resource.name}, ${fmt.date(c.date, "long")}`
                                  : fmt.date(c.date, "long")
                              }
                            />
                          </div>
                        ))}
                  </div>
                </div>
              </div>
            </div>
            {/* The columns past the right edge: whole columns leave no sliver to hint at them. */}
            {moreRight && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 z-50 w-6 bg-gradient-to-l from-foreground/12 to-transparent"
              />
            )}
          </div>
          <CalendarFooter
            count={data.count}
            updating={data.bookingsQ.isFetching}
            blocked={columns.flatMap((c) => c.blocked)}
          />
        </div>
      )}
    </PageContainer>
  );
}

/** Below the grid: how many bookings are shown and the timezone (the shortcuts are in the toolbar's tooltips). */
function CalendarFooter({
  count,
  updating,
  blocked,
}: {
  count: number;
  updating: boolean;
  blocked: BlockedInterval[];
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-1.5 text-xs text-muted-foreground sm:px-5",
        // Room for Bo's launcher, which floats over this corner on phones (from sm up it sits in the rail).
        business.assistantAvailable && "max-sm:pr-20",
      )}
    >
      <span data-tally="day" className="tnum transition-opacity">
        {updating ? "Updating…" : `${count} ${v("booking", { count })}`} ·{" "}
        {business.timezone.split("/").at(-1)?.replace(/_/g, " ")}
      </span>
      <span className="hidden pointer-coarse:inline">Tap a free time to book</span>
      <span className="flex gap-3">
        <span className="inline-flex items-center gap-1.5 max-sm:hidden">
          <span aria-hidden className="size-3 rounded-sm bg-muted ring-1 ring-border dark:bg-background" />
          Not working
        </span>
        {blocked.some((b) => b.kind === "closed") && (
          <span className="inline-flex items-center gap-1.5 max-sm:hidden">
            <span aria-hidden className={cn("size-3 rounded-sm ring-1 ring-border", CLOSED_FILL)} />
            Closed
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm" style={{ backgroundImage: PREPARATION_HATCH }} />
          Preparation time
        </span>
      </span>
    </div>
  );
}
