import { keepPreviousData } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { CalendarSearch } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useStaffAvailability } from "@shared/api/hooks/use-bookings";
import type { Slot } from "@shared/api/types";
import { groupByDayPeriod } from "@shared/booking/periods";
import { useCurrentBusiness } from "@shared/business/business-context";
import { addDaysToPlainDate, toTimeOfDay, type PlainDate } from "@shared/format";
import { Button, Icon, Skeleton, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { useFmt } from "./fmt";
import { Chip } from "./parts";

export type SlotPickerProps = {
  serviceId: string;
  optionId: string | null;
  addonIds: string[];
  resourceId?: string | null;
  date: PlainDate;
  onDateChange: (date: PlainDate) => void;
  /** The chosen slot's start (ISO). */
  value: string | null;
  onChange: (slot: Slot) => void;
  /** Hide this start (the booking's current time when rescheduling). */
  excludeStart?: string | null;
  /** Rescheduling: its own time isn't busy, and its group and duration are used. */
  excludeBookingId?: string | null;
};

/**
 * Free start times for a service on a date (staff availability: private services too, no release schedules),
 * grouped Morning / Afternoon / Evening. Looks a week ahead to offer "Next available". Times a deal discounts show
 * its label; group sessions show the seats left. While another day loads, the previous times stay, dimmed and
 * not choosable.
 */
export function SlotPicker({
  serviceId,
  optionId,
  addonIds,
  resourceId,
  date,
  onDateChange,
  value,
  onChange,
  excludeStart,
  excludeBookingId,
}: SlotPickerProps) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const { colors } = useTheme();
  const availability = useStaffAvailability(
    business.id,
    {
      serviceId,
      optionId,
      addonIds,
      resourceId: resourceId ?? null,
      excludeBookingId: excludeBookingId ?? null,
      from: date,
      to: addDaysToPlainDate(date, 6),
    },
    { placeholderData: keepPreviousData },
  );

  if (availability.isPending || (availability.isPlaceholderData && !hasSlotsOn(availability.data, date))) {
    return (
      <View
        style={styles.grid}
        accessible
        accessibilityLabel="Loading free times"
        accessibilityRole="progressbar"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={styles.skeleton}>
            <Skeleton height={44} radius="full" />
          </View>
        ))}
      </View>
    );
  }
  if (availability.isError) {
    return (
      <View
        accessibilityRole="alert"
        style={[styles.box, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]}
      >
        <Text variant="callout" tone="danger">
          {errorMessage(availability.error)}
        </Text>
        <Button label="Retry" variant="secondary" size="sm" onPress={() => void availability.refetch()} />
      </View>
    );
  }

  const days = availability.data.days;
  const daySlots = (days.find((d) => d.date === date)?.slots ?? []).filter((s) => s.start !== excludeStart);
  const nextDay = days.find((d) => d.date > date && d.slots.length > 0)?.date ?? null;
  const stale = availability.isPlaceholderData;

  if (daySlots.length === 0 && !stale) {
    return (
      <View testID="no-free-times" style={[styles.box, { borderColor: colors.borderStrong }]}>
        <View style={styles.row}>
          <Icon icon={CalendarSearch} size={18} color="subtleForeground" />
          <Text weight="medium">No free times on {fmt.date(date, "dayMonth")}</Text>
        </View>
        {nextDay ? (
          <Button
            label={`Next available: ${fmt.date(nextDay, "dayMonth")}`}
            variant="secondary"
            size="sm"
            onPress={() => onDateChange(nextDay)}
          />
        ) : (
          <Text variant="callout" tone="muted">
            Nothing in the following week either. Try another date or set an exact time.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.groups, stale ? styles.stale : null]} accessibilityState={{ busy: stale }}>
      {groupByDayPeriod(daySlots, (s) => toTimeOfDay(s.start, fmt.tz), 0).map((group) => (
        <View key={group.key} style={styles.group}>
          <Text variant="footnote" tone="subtle">
            {group.label}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={`${group.label ?? ""} times`}
            style={styles.grid}
          >
            {group.items.map((slot) => {
              const extra = [slot.offer?.label, slot.seatsLeft !== null ? `${slot.seatsLeft} left` : null]
                .filter(Boolean)
                .join(" · ");
              const time = fmt.time(slot.start);
              return (
                <Chip
                  key={slot.start}
                  testID={`slot-${time}`}
                  role="radio"
                  label={extra ? `${time} · ${extra}` : time}
                  accessibilityLabel={extra ? `${time}, ${extra}` : time}
                  selected={slot.start === value}
                  disabled={stale}
                  onPress={() => onChange(slot)}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Whether the (possibly placeholder) availability has times on [date]. */
function hasSlotsOn(data: { days: { date: string; slots: unknown[] }[] } | undefined, date: PlainDate) {
  return !!data?.days.some((d) => d.date === date && d.slots.length > 0);
}

const styles = StyleSheet.create({
  groups: { gap: space[3] },
  group: { gap: space[1.5] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  skeleton: { width: space[16] + space[4] },
  stale: { opacity: 0.6 },
  box: {
    gap: space[2],
    padding: space[4],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    borderStyle: "dashed",
    alignItems: "flex-start",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
