import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { AvailabilityOverride } from "@shared/api/types";
import { useDeleteOverride } from "@shared/api/hooks/use-resources";
import { OVERRIDE_KIND_LABEL, overrideKind, type OverrideKind } from "@shared/availability/time-off";
import { useBusinessContext } from "@shared/business/business-context";
import { formatDate } from "@shared/format";
import { Badge, Card, DateTile, Divider, IconButton, Text } from "~/ui";
import { confirmAction, useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { overrideDetail } from "./resources";

const TONE: Record<OverrideKind, "success" | "neutral" | "warning"> = {
  extra: "success",
  off: "neutral",
  partial: "warning",
};

/**
 * Upcoming time off, extra hours or closures (the website's OverrideList), each removable after confirming. A short
 * list inside the resource's scrolling page, so it maps rather than virtualises.
 */
export function OverrideList({
  items,
  editable,
  empty,
}: {
  items: readonly AvailabilityOverride[];
  editable: boolean;
  empty: ReactNode;
}) {
  const { business } = useBusinessContext();
  const remove = useDeleteOverride(business.id);
  const feedback = useSaveFeedback();

  const onRemove = async (o: AvailabilityOverride) => {
    const date = formatDate(o.date, business.timezone, "medium", business.locale);
    const ok = await confirmAction({
      title: `Remove ${date}?`,
      message: `${OVERRIDE_KIND_LABEL[overrideKind(o)]}, ${overrideDetail(o)}.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) await feedback.run(() => remove.mutateAsync(o.id), "Removed");
  };

  if (items.length === 0) return <Card>{empty}</Card>;
  return (
    <Card padding={0}>
      {items.map((o, i) => (
        <View key={o.id}>
          {i > 0 ? <Divider inset={space[4]} /> : null}
          <OverrideRow
            override={o}
            timeZone={business.timezone}
            locale={business.locale}
            removing={remove.isPending && remove.variables === o.id}
            onRemove={editable ? onRemove : undefined}
          />
        </View>
      ))}
    </Card>
  );
}

const OverrideRow = memo(function OverrideRow({
  override: o,
  timeZone,
  locale,
  removing,
  onRemove,
}: {
  override: AvailabilityOverride;
  timeZone: string;
  locale: string;
  removing: boolean;
  onRemove?: (o: AvailabilityOverride) => void;
}) {
  const kind = overrideKind(o);
  const date = formatDate(o.date, timeZone, "medium", locale);
  const detail = overrideDetail(o);
  return (
    <View style={styles.row} testID={`override-${o.id}`}>
      <View
        style={styles.main}
        accessible
        accessibilityLabel={`${formatDate(o.date, timeZone, "full", locale)}, ${OVERRIDE_KIND_LABEL[kind]}, ${detail}`}
      >
        <DateTile date={o.date} timeZone={timeZone} />
        <View style={styles.text}>
          <View style={styles.title}>
            <Text weight="medium">{date}</Text>
            <Badge label={OVERRIDE_KIND_LABEL[kind]} tone={TONE[kind]} />
          </View>
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        </View>
      </View>
      {onRemove ? (
        <IconButton
          icon={Trash2}
          accessibilityLabel={`Remove ${date}`}
          color="mutedForeground"
          testID={`override-remove-${o.id}`}
          disabled={removing}
          accessibilityState={{ busy: removing, disabled: removing }}
          onPress={() => onRemove(o)}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[3],
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[3] },
  text: { flex: 1, gap: space[0.5] },
  title: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
});
