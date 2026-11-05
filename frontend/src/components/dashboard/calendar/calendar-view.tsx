"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
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
import { DayColumn, TimeGutter } from "./calendar-grid";
import { CalendarHeaderRow, colMin } from "./calendar-headers";
import { CalendarToolbar } from "./calendar-toolbar";
import { HOUR_PX } from "./grid-scale";

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
  const [moreRight, setMoreRight] = useState(false);
  const syncMoreRight = useCallback(() => {
    const el = scroller.current;
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
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
    const target = days.includes(today) ? Math.max(firstOpen - 30, nowMinute - 90) : firstBusy - 30;
    scroller.current.scrollTop = Math.max(0, ((target - startHour * 60) / 60) * HOUR_PX);
    // Where the week doesn't fit, it opens on today rather than on Monday.
    const column =
      view === "week" ? scroller.current.querySelectorAll("[role=group]")[days.indexOf(today)] : null;
    if (column instanceof HTMLElement) scroller.current.scrollLeft = column.offsetLeft - HOUR_GUTTER_PX;
  }, [ready, view, date, days, today, nowMinute, firstOpen, startHour, columns, business.timezone]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncMoreRight);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [syncMoreRight, ready]);

  const { loading } = data;

  return (
    <PageContainer size="full" className="flex flex-col">
      {/* The toolbar's date is the visible title; the page still needs a top-level heading. */}
      <h1 className="sr-only">Calendar</h1>
      <CalendarToolbar
        date={date}
        view={view}
        today={today}
        range={data}
        resources={data.resources}
        resourcesLoading={data.resourcesQ.isPending}
        selected={selected}
        showCancelled={url.showCancelled}
        setParams={setParams}
        go={go}
        onNew={newBooking}
      />

      {data.error ? (
        <ErrorState error={data.error} onRetry={data.refetch} headingLevel={2} />
      ) : !data.resourcesQ.isPending && data.resources.length === 0 ? (
        <EmptyState
          headingLevel={2}
          icon={<CalendarPlus />}
          title={`No ${v("resources")} yet`}
          description={`The calendar shows one column per ${v("resource")}. Add your first one to start taking ${v("bookings")}.`}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="relative min-h-0">
            <div
              ref={scroller}
              onScroll={syncMoreRight}
              // Keyboard users scroll the grid too (it is a scroll container, not just its content).
              tabIndex={0}
              role="region"
              aria-label="Calendar"
              // At most the screen's height, but no taller than the day: a short day on a tall iPad leaves no blank well.
              className="@container relative max-h-[calc(100dvh-var(--tab-bar-height,0px)-env(safe-area-inset-bottom)-16rem)] min-h-[420px] snap-x scroll-pl-14 scrollbar-thin overflow-auto overscroll-contain sm:max-h-[calc(100dvh-14.5rem)] xl:max-h-[calc(100dvh-11.5rem)]"
            >
              <div className="flex min-w-full" style={{ width: "max-content" }}>
                <div className="flex min-w-full flex-col">
                  <CalendarHeaderRow
                    columns={columns}
                    view={view}
                    today={today}
                    loading={data.resourcesQ.isPending}
                    onOpenDay={(d) => setParams({ view: null, date: d })}
                  />
                  <CalendarReleases days={days} view={view} today={today} columnClass={colMin(view)} />
                  {/* Grid (dimmed while a new day or week loads over the previous one's bookings) */}
                  <div
                    className={cn("flex transition-opacity", data.updating && "opacity-60")}
                    aria-busy={data.updating || undefined}
                  >
                    <div className="sticky left-0 z-20 bg-surface">
                      <TimeGutter
                        startHour={startHour}
                        endHour={endHour}
                        formatHour={formatHour}
                        nowMinute={days.includes(today) ? nowMinute : null}
                      />
                    </div>
                    {loading
                      ? Array.from({ length: Math.max(columns.length, 3) }, (_, i) => (
                          <div
                            key={i}
                            className={cn("flex-1 border-l border-border p-2", colMin(view))}
                            style={{ height: (endHour - startHour) * HOUR_PX }}
                          >
                            <Skeleton className="mt-16 h-16 w-full rounded-md" />
                            <Skeleton className="mt-24 h-24 w-5/6 rounded-md" />
                          </div>
                        ))
                      : columns.map((c) => (
                          <div key={c.key} className={cn("flex flex-1", colMin(view))}>
                            <DayColumn
                              date={c.date}
                              timeZone={business.timezone}
                              bookings={c.bookings}
                              open={c.open}
                              startHour={startHour}
                              endHour={endHour}
                              nowMinute={c.date === today ? nowMinute : null}
                              compact={view === "week"}
                              formatTime={fmt.time}
                              onSelectBooking={openBooking}
                              onCreate={createAt}
                              resourceId={c.resource?.id}
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
                className="pointer-events-none absolute inset-y-0 right-0 z-40 w-5 bg-gradient-to-l from-foreground/10 to-transparent"
              />
            )}
          </div>
          <CalendarFooter count={data.count} updating={data.bookingsQ.isFetching} />
        </div>
      )}
    </PageContainer>
  );
}

/** Below the grid: how many bookings are shown and the timezone (the shortcuts are in the toolbar's tooltips). */
function CalendarFooter({ count, updating }: { count: number; updating: boolean }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-subtle bg-surface-sunken/60 px-4 py-2 text-xs text-muted-foreground",
        // Room for Bo's launcher, which floats over this corner on phones (from sm up it sits in the sidebar).
        business.assistantAvailable && "max-sm:pr-20",
      )}
    >
      <span className="tnum">
        {updating ? "Updating…" : `${count} ${v("booking", { count })}`} ·{" "}
        {business.timezone.split("/").at(-1)?.replace(/_/g, " ")}
      </span>
      <span className="hidden pointer-coarse:inline">Tap a free time to book</span>
      <span className="hidden gap-3 sm:flex pointer-coarse:hidden">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm border border-dashed border-border-strong" />
          Not confirmed yet
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
