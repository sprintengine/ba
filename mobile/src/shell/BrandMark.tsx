import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui";
import { radius, space } from "~/ui/tokens";

const MARK = require("../../assets/images/splash-icon.png") as number;

/** The bookanything mark and wordmark (sidebar header, sign-in). */
export function BrandMark({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="bookanything">
      <Image
        source={MARK}
        style={{ width: size, height: size, borderRadius: radius.sm }}
        accessible={false}
      />
      {wordmark ? (
        <Text variant={size > 32 ? "title2" : "title3"} weight="bold" accessible={false}>
          bookanything
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: space[2] } });
