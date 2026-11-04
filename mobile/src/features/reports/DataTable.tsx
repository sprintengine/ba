import { memo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

export type TableColumn = { key: string; label: string; align?: "left" | "right" };
export type TableRow = { key: string; cells: string[]; accessibilityLabel: string };

/** Tall enough for about eight rows; the rest scrolls inside (the website's `max-h-80`). */
const MAX_HEIGHT = 320;

/**
 * A chart's table view (its accessible alternative, with exact values): a header row and one row per day, each row
 * read as a sentence ("Thu, 1 Oct 2026: 2 appointments, €90"). Scrolls inside its own box.
 */
export function DataTable({
  columns,
  rows,
  testID,
}: {
  columns: TableColumn[];
  rows: TableRow[];
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { borderColor: colors.border }]} testID={testID}>
      <View
        style={[
          styles.row,
          styles.head,
          { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {columns.map((c, i) => (
          <Text
            key={c.key}
            variant="footnote"
            weight="semibold"
            tone="muted"
            align={c.align === "right" ? "right" : "left"}
            style={i === 0 ? styles.first : styles.cell}
          >
            {c.label}
          </Text>
        ))}
      </View>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {rows.map((row, i) => (
          <Row key={row.key} row={row} columns={columns} divider={i > 0} />
        ))}
      </ScrollView>
    </View>
  );
}

const Row = memo(function Row({
  row,
  columns,
  divider,
}: {
  row: TableRow;
  columns: TableColumn[];
  divider: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider ? { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth } : null,
      ]}
      accessible
      accessibilityLabel={row.accessibilityLabel}
      testID={`row-${row.key}`}
    >
      {row.cells.map((cell, i) => (
        <Text
          key={columns[i]?.key ?? i}
          variant="callout"
          numeric
          align={columns[i]?.align === "right" ? "right" : "left"}
          style={i === 0 ? styles.first : styles.cell}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  head: { borderBottomWidth: StyleSheet.hairlineWidth },
  scroll: { maxHeight: MAX_HEIGHT },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  first: { flex: 2 },
  cell: { flex: 1 },
});
