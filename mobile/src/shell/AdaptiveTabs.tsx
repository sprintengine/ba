/**
 * One tab navigator, two presentations: a bottom tab bar on phones and narrow windows, a sidebar on large screens
 * (iPad, `useLayout().isWide`). The navigator, and every tab's stack history, survive rotating or resizing the window
 * because only the bar is swapped. Used by the customer shell and the business shell.
 */
import { Tabs, router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text, useLayout, useTheme } from "~/ui";
import { layout, MIN_TOUCH, radius, space } from "~/ui/tokens";
import { phoneTabs, sidebarItems, type NavItem } from "./nav";

export type AdaptiveTabsProps = {
  items: NavItem[];
  /** Top of the sidebar (the business switcher, the brand). */
  sidebarHeader?: ReactNode;
  /** Bottom of the sidebar (the account, "Switch to …"). */
  sidebarFooter?: ReactNode;
  /** `<Tabs.Screen>`s, in order (every route of the layout, shown or not). */
  children: ReactNode;
  /** No tab bar or sidebar (signed out, the customer side is Explore alone). */
  barHidden?: boolean;
};

export function AdaptiveTabs({
  items,
  sidebarHeader,
  sidebarFooter,
  children,
  barHidden = false,
}: AdaptiveTabsProps) {
  const { isWide } = useLayout();
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: isWide ? "left" : "bottom", lazy: true }}
      tabBar={({ state }) => {
        if (barHidden) return null;
        const active = state.routes[state.index]?.name;
        return isWide ? (
          <Sidebar
            items={sidebarItems(items)}
            active={active}
            header={sidebarHeader}
            footer={sidebarFooter}
          />
        ) : (
          <BottomBar items={phoneTabs(items)} active={active} />
        );
      }}
    >
      {children}
    </Tabs>
  );
}

function go(href: Href) {
  router.navigate(href);
}

function BottomBar({ items, active }: { items: NavItem[]; active: string | undefined }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bottom,
        { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom },
      ]}
    >
      {items.map((item) => {
        const selected = item.routeName === active;
        return (
          <Pressable
            key={item.key}
            testID={`tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => go(item.href)}
            style={styles.bottomItem}
          >
            <Icon icon={item.icon} size={22} color={selected ? "brand" : "mutedForeground"} />
            <Text
              variant="caption"
              weight={selected ? "semibold" : "medium"}
              style={{ color: selected ? colors.brand : colors.mutedForeground, letterSpacing: 0 }}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sidebar({
  items,
  active,
  header,
  footer,
}: {
  items: NavItem[];
  active: string | undefined;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: colors.surfaceSunken,
          borderRightColor: colors.border,
          paddingTop: insets.top + space[2],
          paddingBottom: insets.bottom + space[2],
          paddingLeft: insets.left,
        },
      ]}
    >
      {header ? <View style={styles.sidebarHeader}>{header}</View> : null}
      <ScrollView accessibilityRole="tablist" contentContainerStyle={styles.sidebarList}>
        {items.map((item) => {
          const selected = item.routeName === active;
          return (
            <Pressable
              key={item.key}
              testID={`tab-${item.key}`}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => go(item.href)}
              style={({ pressed }) => [
                styles.sidebarItem,
                { backgroundColor: selected ? colors.surface : pressed ? colors.muted : "transparent" },
                selected ? { borderColor: colors.border } : null,
              ]}
            >
              <Icon icon={item.icon} size={20} color={selected ? "brand" : "mutedForeground"} />
              <Text variant="body" weight={selected ? "semibold" : "medium"} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {footer ? <View style={styles.sidebarFooter}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  bottomItem: {
    flex: 1,
    minHeight: MIN_TOUCH + space[1],
    alignItems: "center",
    justifyContent: "center",
    gap: space[0.5],
    paddingTop: space[1.5],
    paddingBottom: space[1],
  },
  sidebar: { width: layout.sidebarWidth, borderRightWidth: StyleSheet.hairlineWidth },
  sidebarHeader: { paddingHorizontal: space[3], paddingBottom: space[2] },
  sidebarList: { paddingHorizontal: space[2], gap: space[0.5] },
  sidebarItem: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sidebarFooter: { paddingHorizontal: space[2], paddingTop: space[2] },
});
