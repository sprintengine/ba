import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { CalendarPlus, ChevronLeft, ChevronRight, CircleSlash } from "lucide-react-native";
import { useResources } from "@shared/api/hooks/use-resources";
import type { Booking } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { bookingCapabilities } from "@shared/dashboard/booking-capabilities";
import { calendarStep } from "@shared/dashboard/calendar";
import {
  addDaysToPlainDate,
  isPlainDate,
  isoWeekDates,
  minutesToTime,
  timeToMinutes,
  todayInTz,
  toTimeOfDay,
  type PlainDate,
} from "@shared/format";
import { useNow } from "@shared/hooks/use-now";
import { useVocabulary } from "@shared/vocabulary";
import {
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
  useLayout,
  useTheme,
} from "~/ui";
import { layout as layoutTokens, space } from "~/ui/tokens";
import { useBookingActions } from "~/features/bookings/BookingActions";
import { ChipRow, MonthGrid } from "~/features/bookings/fields";
import { useFmt } from "~/features/bookings/fmt";
import { haptics } from "~/features/bookings/haptics";
import { HeaderNew } from "~/features/bookings/HeaderNew";
import { useKeyCommands } from "~/features/bookings/keys";
import { Chip, ColorDot } from "~/features/bookings/parts";
import { RescheduleSheet } from "~/features/bookings/RescheduleSheet";
import { AgendaList } from "./AgendaList";
import { CalendarHeaderRow } from "./CalendarHeaders";
import { DayColumn, GridLines, HOUR_PX, TimeGutter } from "./TimeGrid";
import { useCalendarData, type GridView } from "./useCalendarData";

export type CalendarMode = GridView | "agenda";

/** Narrowest a resource column may get before the grid scrolls sideways (iPad, many resources). */
const MIN_RESOURCE_COLUMN = 150;

type Params = { date?: string; view?: string; resource?: string };

/**
 * `/dashboard/[slug]/calendar`: day (resources side by side on large screens, one at a time with a switcher on
 * phones), week, and an agenda list, in the business's timezone. Tap a free time to book it, a booking to open it,
 * long-press to move it; swipe sideways for the previous or next day or week.
 */
export function CalendarScreen() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { isWide } = useLayout();
  const params = useLocalSearchParams<Params>();
  const now = useNow(60_000);
  const today = todayInTz(business.timezone, now);
  const { openBooking, openNewBooking } = useBookingActions();
  const [date, setDate] = useState<PlainDate>(params.date && isPlainDate(params.date) ? params.date : today);
  // A link with ?date= (an approved agent request's "Open calendar") moves to that day while the screen stays mounted.
  const [dateParam, setDateParam] = useState(params.date);
  if (params.date !== dateParam) {
    setDateParam(params.date);
    if (params.date && isPlainDate(params.date)) setDate(params.date);
  }
  const [mode, setMode] = useState<CalendarMode>(
    params.view === "week" ? "week" : params.view === "agenda" ? "agenda" : "day",
  );
  const [resourceChoice, setResourceChoice] = useState<string>(params.resource ?? "all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [picking, setPicking] = useState<"date" | "resource" | null>(null);
  const [moving, setMoving] = useState<Booking | null>(null);
  const resources = (useResources(business.id).data ?? []).filter((r) => r.isActive);
  const sortedResources = [...resources].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  // Phones show one resource at a time in day view (the first unless one is chosen).
  const oneAtATime = !isWide && mode === "day" && sortedResources.length > 1;
  const resourceId =
    oneAtATime && resourceChoice === "all" ? (sortedResources[0]?.id ?? "all") : resourceChoice;
  const view: GridView = mode === "week" ? "week" : "day";
  const data = useCalendarData({ date, view, resourceId, showCancelled });
  const step = calendarStep(view);

  const go = useCallback(
    (delta: number) => {
      haptics.select();
      setDate((d) => addDaysToPlainDate(d, delta * step));
    },
    [step],
  );
  const newBooking = useCallback(
    () => openNewBooking({ date, resourceId: data.selected?.id }),
    [openNewBooking, date, data.selected],
  );
  const createAt = useCallback(
    (d: PlainDate, minute: number, rid: string | undefined) => {
      haptics.select();
      openNewBooking({ date: d, time: minutesToTime(minute), resourceId: rid ?? data.selected?.id });
    },
    [openNewBooking, data.selected],
  );
  const move = useCallback(
    (b: Booking) => {
      if (bookingCapabilities(b, new Date()).reschedule) {
        haptics.select();
        setMoving(b);
      } else {
        openBooking(b.id);
      }
    },
    [openBooking],
  );

  useKeyCommands({
    n: { title: `New ${v("booking")}`, run: newBooking },
    t: { title: "Today", run: () => setDate(today) },
    left: { title: view === "day" ? "Previous day" : "Previous week", run: () => go(-1) },
    right: { title: view === "day" ? "Next day" : "Next week", run: () => go(1) },
    "1": { title: "Day", run: () => setMode("day") },
    "2": { title: "Week", run: () => setMode("week") },
    "3": { title: "List", run: () => setMode("agenda") },
  });

  const title =
    mode === "week"
      ? `${fmt.date(data.from, "short")} – ${fmt.date(data.to, "short")}`
      : fmt.date(date, isWide ? "long" : "dayMonth");

  const toolbar = (
    <View style={styles.toolbar}>
      <View style={styles.dateRow}>
        <Chip
          testID="calendar-date"
          label={title}
          accessibilityLabel={`${mode === "week" ? `Week of ${fmt.date(data.from, "long")}` : fmt.date(date, "full")}. Choose a date`}
          onPress={() => setPicking("date")}
        />
        <View style={styles.flex} />
        <IconButton
          testID="calendar-prev"
          icon={ChevronLeft}
          accessibilityLabel={view === "day" ? "Previous day" : "Previous week"}
          onPress={() => go(-1)}
        />
        <IconButton
          testID="calendar-next"
          icon={ChevronRight}
          accessibilityLabel={view === "day" ? "Next day" : "Next week"}
          onPress={() => go(1)}
        />
        <Chip
          testID="calendar-today"
          label="Today"
          disabled={date === today}
          onPress={() => setDate(today)}
        />
      </View>
      <SegmentedControl
        accessibilityLabel="Calendar view"
        value={mode}
        onChange={(m) => {
          haptics.select();
          setMode(m);
        }}
        segments={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "agenda", label: "List" },
        ]}
      />
      {sortedResources.length > 1 || mode !== "agenda" ? (
        <ChipRow accessibilityLabel={`${v("resources", { title: true })} and filters`}>
          {oneAtATime
            ? sortedResources.map((r) => (
                <Chip
                  key={r.id}
                  testID={`resource-${r.id}`}
                  role="radio"
                  label={r.name}
                  selected={r.id === resourceId}
                  onPress={() => setResourceChoice(r.id)}
                />
              ))
            : sortedResources.length > 1
              ? [
                  <Chip
                    key="resource"
                    testID="calendar-resource"
                    label={data.selected?.name ?? `All ${v("resources")}`}
                    selected={!!data.selected}
                    accessibilityLabel={`Show: ${data.selected?.name ?? `All ${v("resources")}`}`}
                    onPress={() => setPicking("resource")}
                  />,
                ]
              : null}
          <Chip
            testID="calendar-cancelled"
            role="checkbox"
            icon={CircleSlash}
            label="Cancelled"
            selected={showCancelled}
            accessibilityHint="Shows cancelled bookings too"
            onPress={() => setShowCancelled((s) => !s)}
          />
        </ChipRow>
      ) : null}
      {mode === "day" ? <WeekStrip date={date} today={today} onChange={setDate} /> : null}
    </View>
  );

  return (
    <Screen testID="calendar-screen">
      <Stack.Screen
        options={{
          title: "Calendar",
          headerRight: () => (
            <HeaderNew label={`New ${v("booking")}`} onPress={newBooking} testID="new-booking" />
          ),
        }}
      />
      {mode === "agenda" ? (
        <AgendaList
          from={date}
          resourceId={resourceId}
          showCancelled={showCancelled}
          header={toolbar}
          onOpen={openBooking}
        />
      ) : (
        <>
          {toolbar}
          {data.error ? (
            <ErrorState error={data.error} onRetry={() => void data.refetch()} />
          ) : !data.resourcesQ.isPending && data.resources.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title={`No ${v("resources")} yet`}
              description={`The calendar shows one column per ${v("resource")}. Add your first one to start taking ${v("bookings")}.`}
            />
          ) : (
            <Grid
              data={data}
              view={view}
              today={today}
              nowMinute={timeToMinutes(toTimeOfDay(now, business.timezone))}
              dateKey={`${view}-${date}-${resourceId}`}
              onSwipe={go}
              onOpen={openBooking}
              onMove={move}
              onCreate={createAt}
              onOpenDay={(d) => {
                setDate(d);
                setMode("day");
              }}
            />
          )}
          <Text
            variant="footnote"
            tone="subtle"
            numeric
            style={styles.footer}
            accessibilityLiveRegion="polite"
          >
            {data.bookingsQ.isFetching ? "Updating…" : `${data.count} ${v("booking", { count: data.count })}`}{" "}
            · {business.timezone.replace(/_/g, " ")} · Tap a free time to book
          </Text>
        </>
      )}

      <Sheet
        visible={picking === "date"}
        onClose={() => setPicking(null)}
        title="Go to date"
        testID="date-sheet"
      >
        <MonthGrid
          value={date}
          today={today}
          locale={fmt.locale}
          onChange={(d) => {
            setDate(d);
            setPicking(null);
          }}
        />
      </Sheet>
      <Sheet
        visible={picking === "resource"}
        onClose={() => setPicking(null)}
        title={`Show ${v("resources")}`}
      >
        <Chip
          role="radio"
          label={`All ${v("resources")}`}
          selected={resourceId === "all"}
          onPress={() => {
            setResourceChoice("all");
            setPicking(null);
          }}
        />
        {sortedResources.map((r) => (
          <View key={r.id} style={styles.resourceRow}>
            <ColorDot color={r.color} />
            <Chip
              role="radio"
              label={r.name}
              selected={resourceId === r.id}
              onPress={() => {
                setResourceChoice(r.id);
                setPicking(null);
              }}
            />
          </View>
        ))}
      </Sheet>
      {moving ? <RescheduleSheet booking={moving} visible onClose={() => setMoving(null)} /> : null}
    </Screen>
  );
}

/** The days of the shown week as chips (Mon 12 … Sun 18), for jumping between days. */
function WeekStrip({
  date,
  today,
  onChange,
}: {
  date: PlainDate;
  today: PlainDate;
  onChange: (d: PlainDate) => void;
}) {
  const fmt = useFmt();
  return (
    <ChipRow accessibilityLabel="Days of the week">
      {isoWeekDates(date).map((d) => (
        <Chip
          key={d}
          role="radio"
          testID={`week-day-${d}`}
          label={`${fmt.date(d, "weekday")} ${Number(d.slice(8))}`}
          accessibilityLabel={`${fmt.date(d, "full")}${d === today ? ", today" : ""}`}
          selected={d === date}
          onPress={() => onChange(d)}
        />
      ))}
    </ChipRow>
  );
}

type GridProps = {
  data: ReturnType<typeof useCalendarData>;
  view: GridView;
  today: PlainDate;
  nowMinute: number;
  /** Changes when another day, week or resource is shown (scrolls to now or opening time again). */
  dateKey: string;
  onSwipe: (delta: number) => void;
  onOpen: (id: string) => void;
  onMove: (b: Booking) => void;
  onCreate: (d: PlainDate, minute: number, resourceId: string | undefined) => void;
  onOpenDay: (d: PlainDate) => void;
};

function Grid({
  data,
  view,
  today,
  nowMinute,
  dateKey,
  onSwipe,
  onOpen,
  onMove,
  onCreate,
  onOpenDay,
}: GridProps) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | null>(null);
  const { columns, startHour, endHour, ready, days, firstOpen } = data;
  const height = (endHour - startHour) * HOUR_PX;
  const minWidth =
    view === "day" && columns.length > 1 ? columns.length * MIN_RESOURCE_COLUMN + space[12] : 0;
  const scrollsSideways = minWidth > width && width > 0;

  // Swipe sideways (when the grid doesn't scroll sideways itself) for the previous or next day or week.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          !scrollsSideways && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > 60) onSwipe(g.dx < 0 ? 1 : -1);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [scrollsSideways, onSwipe],
  );

  // Scroll to "now" (today) or the opening time once the day's hours are known.
  useEffect(() => {
    if (!ready || scrolledFor.current === dateKey) return;
    scrolledFor.current = dateKey;
    const target = days.includes(today) ? nowMinute - 90 : firstOpen - 30;
    scroller.current?.scrollTo({
      y: Math.max(0, ((target - startHour * 60) / 60) * HOUR_PX),
      animated: false,
    });
  }, [ready, dateKey, days, today, nowMinute, firstOpen, startHour]);

  const grid = (
    <View style={[styles.flex, scrollsSideways ? { width: minWidth } : null]}>
      <CalendarHeaderRow
        columns={columns}
        today={today}
        loading={data.resourcesQ.isPending}
        fmt={fmt}
        onOpenDay={onOpenDay}
      />
      <ScrollView
        ref={scroller}
        testID="calendar-grid"
        accessibilityLabel="Calendar"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.mutedForeground}
            onRefresh={() => {
              setRefreshing(true);
              void data.refetch().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={[styles.gridRow, { height, opacity: data.updating ? 0.6 : 1 }]}>
          <TimeGutter startHour={startHour} endHour={endHour} />
          <View style={styles.columns}>
            <GridLines startHour={startHour} endHour={endHour} />
            {data.loading
              ? [0, 1, 2].map((i) => (
                  <View key={i} style={[styles.skeletonColumn, { borderLeftColor: colors.border }]}>
                    <Skeleton height={HOUR_PX} radius="md" />
                  </View>
                ))
              : columns.map((c) => (
                  <DayColumn
                    key={c.key}
                    date={c.date}
                    timeZone={business.timezone}
                    bookings={c.bookings}
                    open={c.open}
                    timeOff={c.timeOff}
                    startHour={startHour}
                    endHour={endHour}
                    nowMinute={c.date === today ? nowMinute : null}
                    compact={view === "week"}
                    fmt={fmt}
                    resourceId={c.resource?.id}
                    label={
                      c.resource
                        ? `${c.resource.name}, ${fmt.date(c.date, "long")}`
                        : fmt.date(c.date, "long")
                    }
                    onOpen={onOpen}
                    onMove={onMove}
                    onCreate={onCreate}
                  />
                ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View
      style={[styles.flex, { borderTopColor: colors.border }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {scrollsSideways ? (
        <ScrollView horizontal testID="calendar-columns" contentContainerStyle={{ width: minWidth }}>
          {grid}
        </ScrollView>
      ) : (
        grid
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    gap: space[2],
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
    width: "100%",
    maxWidth: layoutTokens.maxContentWidth * 2,
    alignSelf: "center",
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: space[1] },
  gridRow: { flexDirection: "row" },
  columns: { flex: 1, flexDirection: "row" },
  skeletonColumn: {
    flex: 1,
    padding: space[2],
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingTop: space[16],
  },
  footer: { paddingHorizontal: space[4], paddingVertical: space[2] },
  resourceRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
