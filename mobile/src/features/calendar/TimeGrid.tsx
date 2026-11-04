/**
 * The calendar's time grid: hour lines and labels, one column per resource (day) or day (week), with open hours as
 * "paper" over the closed sunken background, time off labelled, bookings positioned in overlap lanes with their
 * buffers, and the current-time line. Tap empty time to book it; tap a booking to open it; long-press (or the
 * VoiceOver action) to move it.
 *
 * Columns and events are memoised: a new day or a refetch only re-renders the columns whose bookings changed.
 */
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import type { AvailabilityOverride, Booking } from "@shared/api/types";
import { eventAppearance } from "@shared/dashboard/calendar";
import {
  layoutDay,
  snapMinute,
  type MinuteInterval,
  type PositionedEvent,
} from "@shared/dashboard/calendar-layout";
import { minutesToTime, type PlainDate } from "@shared/format";
import { mix, normalizeHex } from "@shared/theme/color";
import type { Tone } from "@shared/status";
import { Text, useTheme, type ThemeColors } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import type { Fmt } from "~/features/bookings/fmt";

export const HOUR_PX = 64;
export const PX_PER_MIN = HOUR_PX / 60;
export const GUTTER = space[12];

const TONE_COLOR: Record<Tone, keyof ThemeColors> = {
  neutral: "subtleForeground",
  brand: "brand",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

/** Hour labels down the leading edge. */
export function TimeGutter({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <View
      style={[styles.gutter, { height: (endHour - startHour) * HOUR_PX }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: endHour - startHour }, (_, i) =>
        i === 0 ? null : (
          <Text
            key={i}
            variant="caption"
            tone="subtle"
            numeric
            maxFontSizeMultiplier={1.2}
            style={[styles.hourLabel, { top: i * HOUR_PX - space[2] }]}
          >
            {minutesToTime((startHour + i) * 60)}
          </Text>
        ),
      )}
    </View>
  );
}

/** Hour and half-hour lines, drawn once behind every column. */
export function GridLines({ startHour, endHour }: { startHour: number; endHour: number }) {
  const { colors } = useTheme();
  const hours = endHour - startHour;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {Array.from({ length: hours * 2 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.line,
            { top: (i * HOUR_PX) / 2, backgroundColor: i % 2 === 0 ? colors.border : colors.borderSubtle },
          ]}
        />
      ))}
    </View>
  );
}

export type DayColumnProps = {
  date: PlainDate;
  timeZone: string;
  bookings: Booking[];
  open: MinuteInterval[];
  timeOff: AvailabilityOverride[];
  startHour: number;
  endHour: number;
  /** Wall-clock minute of now when the column is today. */
  nowMinute: number | null;
  compact: boolean;
  fmt: Fmt;
  resourceId?: string;
  /** "Alex Morgan, Thursday 15 October" (the column, for VoiceOver). */
  label: string;
  onOpen: (id: string) => void;
  onMove: (booking: Booking) => void;
  /** Book at this minute (the column's resource, if any). */
  onCreate: (date: PlainDate, minute: number, resourceId: string | undefined) => void;
};

export const DayColumn = memo(function DayColumn({
  date,
  timeZone,
  bookings,
  open,
  timeOff,
  startHour,
  endHour,
  nowMinute,
  compact,
  fmt,
  resourceId,
  label,
  onOpen,
  onMove,
  onCreate,
}: DayColumnProps) {
  const { colors } = useTheme();
  const positioned = useMemo(() => layoutDay(bookings, date, timeZone), [bookings, date, timeZone]);
  const top = (m: number) => (m - startHour * 60) * PX_PER_MIN;
  const height = (endHour - startHour) * HOUR_PX;
  const create = (e: GestureResponderEvent) =>
    onCreate(date, snapMinute(e.nativeEvent.locationY, PX_PER_MIN, startHour * 60, 15), resourceId);

  return (
    <View
      testID={`column-${resourceId ?? date}`}
      accessibilityLabel={label}
      style={[
        styles.column,
        { height, backgroundColor: colors.surfaceSunken, borderLeftColor: colors.border },
      ]}
    >
      {/* Tapping empty time books it (VoiceOver and keyboards use the New button, which opens the same form). */}
      <Pressable
        testID={`create-${resourceId ?? date}`}
        style={StyleSheet.absoluteFill}
        onPress={create}
        accessible={false}
        importantForAccessibility="no"
      >
        {open.map((i) => {
          const s = Math.max(i.start, startHour * 60);
          const e = Math.min(i.end, endHour * 60);
          if (e <= s) return null;
          return (
            <View
              key={`${i.start}-${i.end}`}
              pointerEvents="none"
              style={[
                styles.open,
                { top: top(s), height: (e - s) * PX_PER_MIN, backgroundColor: colors.surface },
              ]}
            />
          );
        })}
      </Pressable>
      <TimeOffBlocks items={timeOff} top={top} startHour={startHour} endHour={endHour} compact={compact} />
      {positioned.map((p) => (
        <EventBlock
          key={p.item.id}
          p={p}
          top={top}
          startHour={startHour}
          endHour={endHour}
          compact={compact}
          fmt={fmt}
          onOpen={onOpen}
          onMove={onMove}
        />
      ))}
      {nowMinute !== null && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 ? (
        <View
          testID="now-line"
          pointerEvents="none"
          accessibilityElementsHidden
          style={[styles.now, { top: top(nowMinute), backgroundColor: colors.danger }]}
        >
          <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
        </View>
      ) : null}
    </View>
  );
});

/** Time off and closures with a time range are labelled where they fall; a whole day off at the top. */
function TimeOffBlocks({
  items,
  top,
  startHour,
  endHour,
  compact,
}: {
  items: AvailabilityOverride[];
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  compact: boolean;
}) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <>
      {items.map((o) => {
        const whole = !o.startTime || !o.endTime;
        const [sh = 0, sm = 0] = (o.startTime ?? "00:00").split(":").map(Number);
        const [eh = 24, em = 0] = (o.endTime ?? "24:00").split(":").map(Number);
        const s = Math.max(sh * 60 + sm, startHour * 60);
        const e = Math.min(eh * 60 + em, endHour * 60);
        if (!whole && e <= s) return null;
        const what = o.resourceId === null ? "Closed" : "Time off";
        const text = o.reason ? `${what} · ${o.reason}` : what;
        return (
          <View
            key={o.id}
            pointerEvents="none"
            accessible
            accessibilityLabel={whole ? `${text}, all day` : `${text}, ${o.startTime} to ${o.endTime}`}
            style={[
              styles.timeOff,
              whole
                ? { top: space[1] }
                : { top: top(s) + 1, height: Math.max((e - s) * PX_PER_MIN - 2, space[4]) },
              { borderColor: colors.borderStrong, backgroundColor: colors.muted },
            ]}
          >
            <Text variant="caption" tone="muted" numberOfLines={compact ? 1 : 2}>
              {text}
            </Text>
          </View>
        );
      })}
    </>
  );
}

type EventProps = {
  p: PositionedEvent<Booking>;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  compact: boolean;
  fmt: Fmt;
  onOpen: (id: string) => void;
  onMove: (booking: Booking) => void;
};

/** A booking on the grid: its buffers (faint), and the event clipped to the visible hours. */
const EventBlock = memo(function EventBlock({
  p,
  top,
  startHour,
  endHour,
  compact,
  fmt,
  onOpen,
  onMove,
}: EventProps) {
  const { colors } = useTheme();
  const b = p.item;
  const lo = startHour * 60;
  const hi = endHour * 60;
  const s = Math.max(p.startMin, lo);
  const e = Math.min(p.endMin, hi);
  if (e <= lo || s >= hi) return null;
  const h = Math.max((e - s) * PX_PER_MIN - 2, 20);
  const width = 100 / p.lanes;
  const pos = { left: `${p.lane * width}%` as const, width: `${width}%` as const };
  const look = eventAppearance(b.status);
  const color = normalizeHex(b.service.color) ?? colors.brand;
  const background = mix(color, normalizeHex(colors.surface) ?? colors.surface, look.inactive ? 0.94 : 0.84);
  const short = h < 40;
  const time = `${fmt.time(b.start)}–${fmt.time(b.end)}`;
  const service = `${b.service.name}${b.option ? ` (${b.option.name})` : ""}`;
  const bufferTop = Math.max(p.blockStartMin, lo);
  const bufferBottom = Math.min(p.blockEndMin, hi);
  const label = `${fmt.time(b.start)} to ${fmt.time(b.end)}, ${b.customer.name}, ${service}, ${look.label}`;

  return (
    <>
      {p.blockStartMin < p.startMin ? (
        <View
          pointerEvents="none"
          style={[
            styles.buffer,
            pos,
            { top: top(bufferTop), height: (s - bufferTop) * PX_PER_MIN, backgroundColor: colors.border },
          ]}
        />
      ) : null}
      {p.blockEndMin > p.endMin ? (
        <View
          pointerEvents="none"
          style={[
            styles.buffer,
            pos,
            { top: top(e), height: (bufferBottom - e) * PX_PER_MIN, backgroundColor: colors.border },
          ]}
        />
      ) : null}
      <View style={[styles.eventBox, pos, { top: top(s) + 1, height: h }]}>
        <Pressable
          testID={`event-${b.reference}`}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens the booking. Actions: move."
          accessibilityActions={[{ name: "activate" }, { name: "move", label: "Move" }]}
          onAccessibilityAction={(ev) => (ev.nativeEvent.actionName === "move" ? onMove(b) : onOpen(b.id))}
          onPress={() => onOpen(b.id)}
          onLongPress={() => onMove(b)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.event,
            {
              backgroundColor: pressed
                ? mix(color, normalizeHex(colors.surface) ?? colors.surface, 0.7)
                : background,
              borderColor: look.tentative ? colors[TONE_COLOR[look.tone]] : colors.borderSubtle,
              borderStyle: look.tentative ? "dashed" : "solid",
              opacity: look.inactive ? 0.6 : 1,
            },
          ]}
        >
          <View style={[styles.bar, { backgroundColor: color }]} />
          <View style={styles.eventText}>
            <Text
              variant="footnote"
              weight="semibold"
              numberOfLines={short ? 1 : 2}
              maxFontSizeMultiplier={1.3}
              style={look.inactive ? styles.struck : null}
            >
              {short && !compact ? `${fmt.time(b.start)} ` : ""}
              {b.customer.name}
            </Text>
            {!short ? (
              <Text
                variant="caption"
                tone="muted"
                numberOfLines={compact ? 2 : 1}
                numeric
                maxFontSizeMultiplier={1.3}
              >
                {compact ? fmt.time(b.start) : `${time} · ${service}`}
              </Text>
            ) : null}
          </View>
          {look.showDot ? (
            <View style={[styles.dot, { backgroundColor: colors[TONE_COLOR[look.tone]] }]} />
          ) : null}
        </Pressable>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  gutter: { width: GUTTER },
  hourLabel: { position: "absolute", right: space[2] },
  line: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
  column: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  open: { position: "absolute", left: 0, right: 0 },
  now: { position: "absolute", left: 0, right: 0, height: borderWidth.focus, zIndex: 20 },
  nowDot: {
    position: "absolute",
    left: -space[1],
    top: -space[1],
    width: space[2.5],
    height: space[2.5],
    borderRadius: radius.full,
  },
  timeOff: {
    position: "absolute",
    left: space[1],
    right: space[1],
    paddingHorizontal: space[1.5],
    paddingVertical: space[0.5],
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    zIndex: 2,
  },
  buffer: { position: "absolute", opacity: 0.5 },
  eventBox: { position: "absolute", paddingHorizontal: space[0.5], zIndex: 5 },
  event: {
    flex: 1,
    flexDirection: "row",
    borderRadius: radius.xs,
    borderWidth: borderWidth.hairline,
    overflow: "hidden",
  },
  bar: { width: space[1] },
  eventText: { flex: 1, paddingHorizontal: space[1.5], paddingVertical: space[0.5] },
  struck: { textDecorationLine: "line-through" },
  dot: {
    position: "absolute",
    top: space[1.5],
    right: space[1.5],
    width: space[1.5],
    height: space[1.5],
    borderRadius: radius.full,
  },
});
