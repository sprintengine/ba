import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { useTheme } from "./theme";
import { layout, space } from "./tokens";

/** A screen's background (under a native Stack header, which handles the top inset). */
export function Screen({ children, testID }: { children?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.fill, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

export type ScreenScrollProps = Omit<ScrollViewProps, "refreshControl"> & {
  children: ReactNode;
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * A scrolling screen: content padded, centred and width-capped on iPad, under a large native header
 * (`contentInsetAdjustmentBehavior`), with optional pull-to-refresh.
 */
export function ScreenScroll({
  children,
  refreshing,
  onRefresh,
  contentContainerStyle,
  ...rest
}: ScreenScrollProps) {
  const { colors } = useTheme();
  // Inside a painted view (like <Screen>): with the scroll view as the screen's own root, iOS hides the large title.
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, contentContainerStyle]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.mutedForeground}
            />
          ) : undefined
        }
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: space[4],
    gap: space[4],
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
});
