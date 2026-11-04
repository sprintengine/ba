import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { layout, radius, space } from "./tokens";

/**
 * One row of an inset grouped list inside a FlashList (iOS Settings style, the website's bordered `<ul>` cards): a
 * surface with rounded corners at the ends of its group and a hairline between rows. Centred and width-capped on
 * iPad. Pass whether the row starts or ends its group:
 *
 *   renderItem={({ item, index }) => <GroupedItem first={…} last={…}><ListRow … /></GroupedItem>}
 */
export function GroupedItem({
  first,
  last,
  children,
  separatorInset = space[4],
  dashed,
}: {
  first: boolean;
  last: boolean;
  children: ReactNode;
  /** Where the hairline under the row starts (line it up with the row's text). */
  separatorInset?: number;
  /** A dashed outline (inactive items, the website's "Inactive" list). */
  dashed?: boolean;
}) {
  const { colors } = useTheme();
  const round = radius["2xl"];
  return (
    <View
      style={[
        styles.item,
        {
          backgroundColor: dashed ? colors.surfaceSunken : colors.surface,
          borderColor: dashed ? colors.borderStrong : colors.border,
          borderStyle: dashed ? "dashed" : "solid",
          borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
          borderBottomWidth: last ? StyleSheet.hairlineWidth : 0,
          borderTopLeftRadius: first ? round : 0,
          borderTopRightRadius: first ? round : 0,
          borderBottomLeftRadius: last ? round : 0,
          borderBottomRightRadius: last ? round : 0,
        },
      ]}
    >
      {children}
      {last ? null : (
        <View
          style={[styles.separator, { marginLeft: separatorInset, backgroundColor: colors.borderSubtle }]}
        />
      )}
    </View>
  );
}

/** A group's title above its rows ("PENDING INVITATIONS"), a heading to screen readers. */
export function GroupTitle({ title, first }: { title: string; first?: boolean }) {
  return (
    <View style={[styles.width, first ? styles.titleFirst : styles.title]}>
      <Text variant="caption" tone="subtle" accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  item: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth },
  title: { paddingTop: space[6], paddingBottom: space[2], paddingHorizontal: space[4] },
  titleFirst: { paddingBottom: space[2], paddingHorizontal: space[4] },
});
