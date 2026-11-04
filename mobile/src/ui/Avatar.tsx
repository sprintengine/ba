import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { normalizeHex, readableForeground } from "@shared/theme/color";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { radius } from "./tokens";

export type BusinessAvatarProps = {
  name: string;
  logoUrl?: string | null;
  /** The business's brand colour (behind the initial when there is no logo). */
  color?: string | null;
  size?: number;
};

/** A business's logo, or its initial on its colour (the website's BusinessTile). Decorative: the name is beside it. */
export function BusinessAvatar({ name, logoUrl, color, size = 32 }: BusinessAvatarProps) {
  const { colors } = useTheme();
  const bg = normalizeHex(color) ?? colors.brand;
  const box = { width: size, height: size, borderRadius: size >= 40 ? radius.lg : radius.sm };
  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[box, { backgroundColor: colors.muted }]}
        contentFit="cover"
        transition={120}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }
  return (
    <View
      style={[styles.tile, box, { backgroundColor: bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        variant={size >= 40 ? "title3" : "footnote"}
        weight="bold"
        style={{ color: readableForeground(bg) }}
        maxFontSizeMultiplier={1}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ tile: { alignItems: "center", justifyContent: "center" } });
