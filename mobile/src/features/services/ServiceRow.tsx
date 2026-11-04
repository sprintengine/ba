import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useReplaceService } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import { serviceWith } from "@shared/services/service-form";
import { Badge, Icon, IconButton, Text, useTheme } from "~/ui";
import { hapticSelection, useSaveFeedback } from "~/ui/form";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { RowToggle } from "./RowToggle";
import { serviceBadges, serviceRowLabel, serviceSummary } from "./services";

type Patch = { isPublic?: boolean; isActive?: boolean };

export type ServiceRowProps = {
  service: Service;
  /** Admins: the Public and Active switches, and the row opens the editor. */
  canEdit: boolean;
  onOpen?: (service: Service) => void;
  /** The open service of the iPad split view. */
  selected?: boolean;
  /** While editing the order: its place in the list, and moving it. */
  reorder?: { index: number; count: number; onMove: (id: string, delta: -1 | 1) => void };
};

/**
 * One service (the website's ServiceRow): colour bar, name with Private / Approval / seats badges, then length,
 * price, payment and how many options and add-ons. Admins get Public and Active switches that save at once (shown
 * straight away, put back if the server refuses) and open the editor from the row.
 */
export const ServiceRow = memo(function ServiceRow({
  service: s,
  canEdit,
  onOpen,
  selected,
  reorder,
}: ServiceRowProps) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const replace = useReplaceService(business.id);
  const feedback = useSaveFeedback();
  // What was just switched, shown while it saves (and dropped if it fails).
  const [pending, setPending] = useState<Patch>({});
  const shown = { ...s, ...pending };
  const summary = serviceSummary(s, business.currency, business.locale);
  const label = serviceRowLabel(shown, summary);

  const toggle = async (patch: Patch, message: string) => {
    hapticSelection();
    setPending((p) => ({ ...p, ...patch }));
    await feedback.run(() => replace.mutateAsync({ id: s.id, input: serviceWith(s, patch) }), message);
    setPending({});
  };

  const text = (
    <View style={styles.text}>
      <View style={styles.titleRow}>
        <Text weight="medium" numberOfLines={2} style={styles.title}>
          {s.name}
        </Text>
        {serviceBadges(shown).map((b) => (
          <Badge key={b.label} label={b.label} tone={b.tone} />
        ))}
      </View>
      <Text variant="callout" tone="muted" numeric>
        {summary.join(" · ")}
      </Text>
      {reorder && s.category?.trim() ? (
        <Text variant="footnote" tone="subtle">
          {s.category.trim()}
        </Text>
      ) : null}
    </View>
  );
  const bar = <View style={[styles.bar, { backgroundColor: s.color }]} />;

  if (reorder) {
    const { index, count, onMove } = reorder;
    return (
      <View style={styles.row} testID={`service-row-${s.id}`}>
        {bar}
        <View
          style={styles.reorderText}
          accessible
          accessibilityLabel={`${label}, position ${index + 1} of ${count}`}
        >
          {text}
        </View>
        <IconButton
          icon={ArrowUp}
          accessibilityLabel={`Move ${s.name} up`}
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          color={index === 0 ? "subtleForeground" : "foreground"}
          onPress={() => onMove(s.id, -1)}
          testID={`service-move-up-${s.id}`}
        />
        <IconButton
          icon={ArrowDown}
          accessibilityLabel={`Move ${s.name} down`}
          accessibilityState={{ disabled: index === count - 1 }}
          disabled={index === count - 1}
          color={index === count - 1 ? "subtleForeground" : "foreground"}
          onPress={() => onMove(s.id, 1)}
          testID={`service-move-down-${s.id}`}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.row, selected ? { backgroundColor: colors.brandSoft } : null]}
      testID={`service-row-${s.id}`}
    >
      {bar}
      <View style={styles.main}>
        {onOpen ? (
          <Pressable
            testID={`service-open-${s.id}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Edit this service"
            accessibilityState={{ selected: !!selected }}
            onPress={() => onOpen(s)}
            style={({ pressed }) => [styles.open, pressed ? { backgroundColor: colors.muted } : null]}
          >
            {text}
            <Icon icon={ChevronRight} size={18} color="subtleForeground" />
          </Pressable>
        ) : (
          <View style={styles.open} accessible accessibilityLabel={label} testID={`service-open-${s.id}`}>
            {text}
          </View>
        )}
        {canEdit ? (
          <View style={styles.toggles}>
            <RowToggle
              label="Public"
              name={s.name}
              hint={shown.isPublic ? "Shown on your booking page" : "Hidden from your booking page"}
              value={shown.isPublic}
              disabled={replace.isPending || !shown.isActive}
              onChange={(c) =>
                void toggle({ isPublic: c }, c ? `${s.name} is on your page` : `${s.name} is now private`)
              }
              testID={`service-public-${s.id}`}
            />
            <RowToggle
              label="Active"
              name={s.name}
              hint={shown.isActive ? "Bookable" : "Can't be booked"}
              value={shown.isActive}
              disabled={replace.isPending}
              onChange={(c) =>
                void toggle({ isActive: c }, c ? `${s.name} activated` : `${s.name} deactivated`)
              }
              testID={`service-active-${s.id}`}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[3],
  },
  bar: { width: space[1], alignSelf: "stretch", borderRadius: radius.full },
  main: { flex: 1, gap: space[1] },
  open: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderRadius: radius.md,
    paddingRight: space[2],
  },
  reorderText: { flex: 1 },
  text: { flex: 1, gap: space[1] },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1.5] },
  title: { flexShrink: 1 },
  toggles: { flexDirection: "row", gap: space[4], paddingRight: space[2] },
});
