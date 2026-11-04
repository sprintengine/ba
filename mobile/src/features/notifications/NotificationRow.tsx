import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { AppNotification } from "@shared/api/types";
import { Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { timeAgo } from "./links";

/** One notification: an unread dot, its title and detail, the business and when. One accessible button. */
export const NotificationRow = memo(function NotificationRow({
  notification: n,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
}) {
  const { colors } = useTheme();
  const meta = [n.businessName, timeAgo(n.createdAt)].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[n.read ? null : "Unread.", n.title, n.body, meta].filter(Boolean).join(" ")}
      onPress={() => onOpen(n)}
      testID={`notification-${n.id}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      <View style={[styles.dot, { backgroundColor: n.read ? "transparent" : colors.brand }]} />
      <View style={styles.text}>
        <Text variant="callout" weight={n.read ? "regular" : "semibold"} tone={n.read ? "muted" : "default"}>
          {n.title}
        </Text>
        {n.body ? (
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {n.body}
          </Text>
        ) : null}
        <Text variant="footnote" tone="subtle">
          {meta}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  dot: { width: 8, height: 8, borderRadius: radius.full, marginTop: space[1.5] },
  text: { flex: 1, gap: space[0.5] },
});
