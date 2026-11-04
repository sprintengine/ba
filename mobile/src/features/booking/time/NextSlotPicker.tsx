import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ArrowRight, CalendarClock, Check, RotateCcw } from "lucide-react-native";
import type { NextSlot } from "@shared/api/hooks/use-next-slot";
import type { Slot } from "@shared/api/types";
import {
  diffPlainDates,
  formatDate,
  formatRelativeDay,
  formatTime,
  toPlainDate,
  todayInTz,
} from "@shared/format";
import { opensLabel } from "@shared/releases/text";
import { Button, Card, DateTile, ErrorState, Icon, Skeleton, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { Callout } from "../Callout";
import { DealBadge, DealPrice } from "../deals";
import { useRefetchAt } from "./refetch";
import { NoTimesAtAll } from "./SlotPicker";
import { TimezoneNote } from "./TimezoneNote";

export type NextSlotPickerProps = {
  timeZone: string;
  locale?: string;
  /** Shows a deal price on a discounted time (§19). */
  currency?: string;
  next: NextSlot;
  /** The customer asked for a later time, so this isn't the earliest one. */
  stepped: boolean;
  /** The offered time is the one already chosen. */
  selected: boolean;
  /** The main action, e.g. "Book this time". */
  chooseLabel: string;
  onChoose: (slot: Slot) => void;
  onLater: (slot: Slot) => void;
  onEarliest: () => void;
  notice?: ReactNode;
};

/**
 * For businesses that offer their next available time only: one time at a time instead of a calendar, with "Show a
 * later time" to step forward and a way back to the earliest (the website's NextSlotPicker).
 */
export function NextSlotPicker({
  timeZone,
  locale,
  currency,
  next,
  stepped,
  selected,
  chooseLabel,
  onChoose,
  onLater,
  onEarliest,
  notice,
}: NextSlotPickerProps) {
  // More times open later (a release schedule, §21): say when, and look again then.
  useRefetchAt(next.opensAt, next.refetch);
  const opening = next.opensAt ? opensLabel(next.opensAt, timeZone, locale) : null;
  return (
    <View style={styles.root} testID="next-slot-picker">
      {notice}
      {next.isError && !next.slot ? (
        <ErrorState
          error={next.error}
          onRetry={next.refetch}
          title="We couldn't find the next available time"
        />
      ) : next.slot ? (
        <OfferedTime
          slot={next.slot}
          timeZone={timeZone}
          locale={locale}
          currency={currency}
          stepped={stepped}
          selected={selected}
          busy={next.isFetching}
          chooseLabel={chooseLabel}
          onChoose={onChoose}
          onLater={onLater}
          onEarliest={onEarliest}
        />
      ) : next.none ? (
        opening ? (
          <Callout
            icon={null}
            title={`More times open ${opening}`}
            action={
              stepped ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  label="Back to the earliest time"
                  onPress={onEarliest}
                />
              ) : null
            }
          >
            Nothing is free for online booking right now. Come back then to book.
          </Callout>
        ) : stepped ? (
          <Callout
            tone="dashed"
            icon={null}
            title="No later times available"
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                label="Back to the earliest time"
                onPress={onEarliest}
              />
            }
          >
            That was the last time open for online booking for now.
          </Callout>
        ) : (
          <NoTimesAtAll />
        )
      ) : (
        <View accessible accessibilityLabel="Finding the next available time" accessibilityRole="progressbar">
          <Card>
            <View style={styles.offer}>
              <Skeleton width={56} height={64} radius="xl" />
              <View style={styles.flex}>
                <Skeleton width="40%" height={14} />
                <Skeleton width="80%" height={22} />
                <Skeleton width="50%" height={18} />
              </View>
            </View>
          </Card>
        </View>
      )}
      {next.slot && opening ? (
        <View style={styles.row}>
          <Icon icon={CalendarClock} size={16} color="mutedForeground" />
          <Text variant="callout" tone="muted">
            More times open {opening}.
          </Text>
        </View>
      ) : null}
      <TimezoneNote timeZone={timeZone} />
    </View>
  );
}

function OfferedTime({
  slot,
  timeZone,
  locale,
  currency,
  stepped,
  selected,
  busy,
  chooseLabel,
  onChoose,
  onLater,
  onEarliest,
}: Omit<NextSlotPickerProps, "next" | "notice"> & { slot: Slot; busy: boolean }) {
  const date = toPlainDate(slot.start, timeZone);
  const soon = diffPlainDates(date, todayInTz(timeZone)) <= 1;
  const longDate = formatDate(date, timeZone, "long", locale);
  const deal = slot.offer ?? null;
  const fewSeats = slot.seatsLeft !== null && slot.seatsLeft <= 5;
  return (
    <Card testID="next-slot" style={busy ? styles.busy : undefined}>
      <View style={styles.offer} accessibilityLiveRegion="polite">
        <DateTile date={date} timeZone={timeZone} />
        <View style={styles.flex}>
          <View style={styles.row}>
            <Icon icon={CalendarClock} size={14} color="brand" />
            <Text variant="caption" tone="brand">
              {(selected
                ? "Your chosen time"
                : stepped
                  ? "Next available after that"
                  : "Next available"
              ).toUpperCase()}
            </Text>
          </View>
          <Text variant="title3">
            {soon ? `${formatRelativeDay(date, timeZone, locale)} · ${longDate}` : longDate}
          </Text>
          <Text variant="body" tone="muted" numeric>
            {formatTime(slot.start, timeZone, locale)} – {formatTime(slot.end, timeZone, locale)}
          </Text>
          {deal ? (
            <View style={styles.row}>
              <DealBadge label={deal.label} />
              {currency ? (
                <DealPrice
                  originalCents={deal.originalPriceCents}
                  priceCents={deal.priceCents}
                  currency={currency}
                  locale={locale}
                />
              ) : null}
            </View>
          ) : null}
          {fewSeats ? (
            <Text variant="callout" tone="muted">
              {slot.seatsLeft} {slot.seatsLeft === 1 ? "place" : "places"} left
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          testID="next-slot-choose"
          variant="primary"
          size="lg"
          fullWidth
          icon={selected ? Check : undefined}
          label={chooseLabel}
          accessibilityState={{ selected }}
          onPress={() => onChoose(slot)}
        />
        <Button
          testID="next-slot-later"
          variant="secondary"
          size="lg"
          fullWidth
          icon={ArrowRight}
          label="Show a later time"
          disabled={busy}
          onPress={() => onLater(slot)}
        />
        {stepped ? (
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            label="Back to the earliest time"
            onPress={onEarliest}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[5] },
  offer: { flexDirection: "row", gap: space[4], alignItems: "flex-start" },
  flex: { flex: 1, gap: space[1] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  actions: { gap: space[2], marginTop: space[5] },
  busy: { opacity: 0.7 },
});
