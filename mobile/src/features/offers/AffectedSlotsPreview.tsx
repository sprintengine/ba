import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { CalendarSearch } from "lucide-react-native";
import type { OfferPreview, OfferPreviewInput } from "@shared/api/types";
import { useOfferPreview } from "@shared/api/hooks/use-offers";
import { useBusinessContext } from "@shared/business/business-context";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { previewInput, PREVIEW_DAYS, type OfferFormValues } from "@shared/offers/offer-form";
import { ErrorState, Icon, Section, Skeleton, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { Meter } from "../reports/chart/Meter";
import { useBusinessFormat } from "../reports/format";
import { DealPrice } from "./DealPrice";

/** Slots listed per day before collapsing into "+N more". */
const PER_DAY = 6;

/**
 * Live "Affected times" (the website's AffectedSlotsPreview): once the draft is valid, asks the API which bookable
 * times in the next week it would discount (debounced, the last answer stays while the next loads).
 */
export function AffectedSlotsPreview({
  control,
  delay = 400,
}: {
  control: Control<OfferFormValues>;
  /** Debounce for the request (tests use 0). */
  delay?: number;
}) {
  const { business } = useBusinessContext();
  const values = useWatch({ control }) as OfferFormValues;
  // Keyed by content so re-renders without changes don't restart the debounce.
  const input = previewInput(values);
  const key = input ? JSON.stringify(input) : null;
  const debouncedKey = useDebouncedValue(key, delay);
  const request = useMemo(
    () => (debouncedKey ? (JSON.parse(debouncedKey) as OfferPreviewInput) : null),
    [debouncedKey],
  );
  const preview = useOfferPreview(business.id, key ? request : null, { meta: { persist: false } });
  const settling = key !== debouncedKey || preview.isFetching;

  return (
    <Section
      title="Affected times"
      testID="offer-preview"
      action={
        key && settling && preview.data ? (
          <Text variant="footnote" tone="subtle" accessibilityLiveRegion="polite">
            Updating…
          </Text>
        ) : null
      }
    >
      {!key ? (
        <Hint
          title="Nothing to preview yet"
          text="Pick at least one service and a valid discount and schedule to see which times this deal would discount."
        />
      ) : preview.isError && !preview.data ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
      ) : !preview.data ? (
        <View
          style={styles.list}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading affected times"
        >
          <Skeleton height={64} radius="lg" />
          <Skeleton height={16} width="40%" />
          <Skeleton height={96} radius="lg" />
        </View>
      ) : (
        <PreviewResult preview={preview.data} />
      )}
    </Section>
  );
}

function PreviewResult({ preview }: { preview: OfferPreview }) {
  const fmt = useBusinessFormat();
  const { colors } = useTheme();
  const { affectedSlots: affected, totalSlots: total } = preview;
  const pct = total > 0 ? Math.round((affected / total) * 100) : 0;
  const listed = preview.days.reduce((n, d) => n + d.slots.length, 0);
  const summary = `${affected} of ${total} times in the next ${PREVIEW_DAYS} days`;
  return (
    <View style={styles.list}>
      <View style={styles.summary}>
        <Text variant="callout" tone="muted" accessibilityLiveRegion="polite" testID="offer-preview-summary">
          <Text variant="title2" numeric accessibilityRole="text">
            {affected}
          </Text>{" "}
          of {total} times in the next {PREVIEW_DAYS} days
        </Text>
        <Meter
          percent={pct}
          accessibilityLabel="Share of times discounted"
          value={{ min: 0, max: 100, now: pct, text: `${pct}%, ${summary}` }}
        />
      </View>
      {total === 0 ? (
        <Hint
          title="Nothing bookable this week"
          text={`None of these services has free times in the next ${PREVIEW_DAYS} days, so there's nothing to discount yet.`}
        />
      ) : affected === 0 ? (
        <Hint title="No times match" text="Try more days, wider hours or a longer last-minute window." />
      ) : (
        <>
          {preview.days.map((day) => (
            <View key={day.date} style={styles.day} testID={`offer-preview-${day.date}`}>
              <Text variant="callout" weight="semibold" accessibilityRole="header">
                {fmt.relDay(day.date)}
              </Text>
              <View style={[styles.slots, { borderColor: colors.border }]}>
                {day.slots.slice(0, PER_DAY).map((s, i) => (
                  <View
                    key={`${s.start}-${s.serviceId}`}
                    style={[
                      styles.slot,
                      i > 0
                        ? { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }
                        : null,
                    ]}
                  >
                    <View style={styles.slotText}>
                      <Text variant="callout" weight="medium" numeric>
                        {fmt.time(s.start)}
                      </Text>
                      <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
                        {s.serviceName}
                      </Text>
                    </View>
                    <DealPrice
                      originalCents={s.originalPriceCents}
                      priceCents={s.priceCents}
                      currency={preview.currency}
                      locale={fmt.locale}
                    />
                  </View>
                ))}
                {day.slots.length > PER_DAY ? (
                  <Text
                    variant="footnote"
                    tone="muted"
                    style={[styles.more, { borderTopColor: colors.borderSubtle }]}
                  >
                    + {day.slots.length - PER_DAY} more
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {listed < affected ? (
            <Text variant="footnote" tone="muted">
              Showing the first {listed} times.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function Hint({ title, text }: { title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.hint, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}
      accessible
      accessibilityLabel={`${title}. ${text}`}
    >
      <Icon icon={CalendarSearch} size={20} color="subtleForeground" />
      <Text variant="callout" weight="medium" align="center">
        {title}
      </Text>
      <Text variant="footnote" tone="muted" align="center">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: space[4] },
  summary: { gap: space[2.5] },
  day: { gap: space[1.5] },
  slots: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  slotText: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: space[2] },
  more: {
    paddingHorizontal: space[3],
    paddingVertical: space[1.5],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: radius.xl,
    paddingHorizontal: space[4],
    paddingVertical: space[8],
  },
});
