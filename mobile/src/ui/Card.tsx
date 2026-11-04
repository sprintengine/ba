import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "./theme";
import { borderWidth, radius, space } from "./tokens";

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card one button (give it an accessibilityLabel that says where it goes). */
  onPress?: PressableProps["onPress"];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Inner padding; 0 for edge-to-edge content such as lists. */
  padding?: keyof typeof space;
  /** A thin bar of the brand colour along the leading edge (a business's booking). */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A surface: lists, summaries, a booking. */
export function Card({ children, onPress, padding = 4, accent, style, ...a11y }: CardProps) {
  const { colors } = useTheme();
  const base = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border, padding: space[padding] },
    accent ? { paddingLeft: space[padding] + space[1] } : null,
    style,
  ];
  const bar = accent ? <View style={[styles.accent, { backgroundColor: colors.brand }]} /> : null;
  if (!onPress) {
    return (
      <View style={base} testID={a11y.testID}>
        {bar}
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      {...a11y}
      style={({ pressed }) => [...base, pressed ? { backgroundColor: colors.muted } : null]}
    >
      {bar}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius["2xl"], borderWidth: borderWidth.hairline, overflow: "hidden" },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: space[1] },
});
