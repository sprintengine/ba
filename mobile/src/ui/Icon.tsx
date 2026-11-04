import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "./theme";
import type { ThemeColors } from "./tokens";

/** One icon set for the whole app: lucide (the website's set), via `lucide-react-native`. */
export type IconComponent = LucideIcon;

export type IconProps = {
  icon: IconComponent;
  size?: number;
  /** A theme colour name; defaults to the foreground. */
  color?: keyof ThemeColors;
  strokeWidth?: number;
};

/** A decorative icon (hidden from screen readers: the control or text next to it carries the meaning). */
export function Icon({ icon: Glyph, size = 20, color = "foreground", strokeWidth = 1.75 }: IconProps) {
  const { colors } = useTheme();
  return (
    <Glyph
      size={size}
      color={colors[color]}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
