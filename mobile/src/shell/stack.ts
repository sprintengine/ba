import type { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { useTheme } from "~/ui";
import { fontFamily } from "~/ui/tokens";

type StackOptions = NonNullable<ComponentProps<typeof Stack>["screenOptions"]>;

/**
 * Native stack header options in the app's theme. Every `_layout.tsx` Stack uses them:
 * `<Stack screenOptions={useStackOptions()} />`; a tab's first screen adds `headerLargeTitle: true`.
 */
export function useStackOptions(): Exclude<StackOptions, (...args: never[]) => unknown> {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.foreground,
    headerTitleStyle: { fontFamily: fontFamily.semibold, color: colors.foreground },
    headerLargeTitleStyle: { fontFamily: fontFamily.bold, color: colors.foreground },
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.background },
  };
}
