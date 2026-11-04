import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { Resource } from "@shared/api/types";
import { readableForeground } from "@shared/theme/color";
import { Icon, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { KIND_ICON, resourceA11yLabel, resourceSubtitle } from "./resources";

/** A resource's colour with its kind's icon (the website's swatch in the resources nav). */
export function ResourceSwatch({ resource, size = SWATCH }: { resource: Resource; size?: number }) {
  const Glyph = KIND_ICON[resource.kind];
  return (
    <View
      style={[styles.swatch, { width: size, height: size, backgroundColor: resource.color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Glyph size={size / 2} color={readableForeground(resource.color)} strokeWidth={2} />
    </View>
  );
}

/** One resource in the list: swatch, name, who it's linked to (or its kind), inactive ones dimmed. */
export const ResourceRow = memo(function ResourceRow({
  resource: r,
  linkedTo,
  selected,
  chevron,
  onPress,
}: {
  resource: Resource;
  linkedTo: string | null;
  /** The open one in a split view. */
  selected: boolean;
  chevron: boolean;
  onPress: (resource: Resource) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`resource-${r.id}`}
      accessibilityRole="button"
      accessibilityLabel={resourceA11yLabel(r, linkedTo)}
      accessibilityHint="Opens its weekly hours and time off"
      accessibilityState={{ selected }}
      onPress={() => onPress(r)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.muted : selected ? colors.brandSoft : "transparent" },
      ]}
    >
      <View style={r.isActive ? null : styles.dim}>
        <ResourceSwatch resource={r} />
      </View>
      <View style={styles.text}>
        <Text weight="medium" numberOfLines={1} tone={r.isActive ? "default" : "muted"}>
          {r.name}
        </Text>
        <Text variant="callout" tone="muted" numberOfLines={1}>
          {resourceSubtitle(r, linkedTo)}
        </Text>
      </View>
      {chevron ? <Icon icon={ChevronRight} size={18} color="subtleForeground" /> : null}
    </Pressable>
  );
});

const SWATCH = 36;

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  swatch: { borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  dim: { opacity: 0.6 },
  text: { flex: 1, gap: space[0.5] },
});
