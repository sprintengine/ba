import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { CustomerGroup } from "@shared/api/types";
import { Badge, Icon, Text, useTheme } from "~/ui";
import { MIN_TOUCH, space } from "~/ui/tokens";

/** One customer group: its name, Restricted and Inactive marks, and description. Opens its sheet. */
export const GroupRow = memo(function GroupRow({
  group: g,
  onPress,
}: {
  group: CustomerGroup;
  onPress: (group: CustomerGroup) => void;
}) {
  const { colors } = useTheme();
  const label = [g.name, g.restricted ? "restricted" : null, g.isActive ? null : "inactive", g.description]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      testID={`group-${g.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Edit or delete the group"
      onPress={() => onPress(g)}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
    >
      <View style={styles.text}>
        <View style={styles.title}>
          <Text weight="medium" style={styles.name}>
            {g.name}
          </Text>
          {g.restricted ? <Badge label="Restricted" tone="warning" /> : null}
          {g.isActive ? null : <Badge label="Inactive" />}
        </View>
        {g.description ? (
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {g.description}
          </Text>
        ) : null}
      </View>
      <Icon icon={ChevronRight} size={18} color="subtleForeground" />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  text: { flex: 1, gap: space[1] },
  title: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  name: { flexShrink: 1 },
});
