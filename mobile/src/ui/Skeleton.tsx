import { useEffect, useState } from "react";
import { Animated, type DimensionValue } from "react-native";
import { useReducedMotion } from "./motion";
import { useTheme } from "./theme";
import { radius as radii } from "./tokens";

/** A loading placeholder in the shape of what's coming. Pulses unless Reduce Motion is on; hidden from screen readers. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "md",
}: {
  width?: DimensionValue;
  height?: number;
  radius?: keyof typeof radii;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radii[radius], backgroundColor: colors.muted, opacity }}
    />
  );
}
