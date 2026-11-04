import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "./theme";
import { layout } from "./tokens";

/**
 * List and detail side by side on large screens (iPad, landscape foldables): the list keeps its scroll position and
 * the detail changes beside it. Render it only when `useLayout().isWide`; on phones push the detail route instead.
 */
export function SplitView({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.background }]}>
      <View style={[styles.list, { borderRightColor: colors.border }]}>{list}</View>
      <View style={styles.detail}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  list: { width: layout.splitListWidth, borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
});
