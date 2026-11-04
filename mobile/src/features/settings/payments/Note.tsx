import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme, type IconComponent } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";

/** A small fact under the payments status ("0% platform fee"): a brand icon, a title and a sentence. */
export function Note({ icon, title, text }: { icon: IconComponent; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${text}`}
      style={[styles.note, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
    >
      <Icon icon={icon} size={18} color="brand" />
      <View style={styles.text}>
        <Text variant="callout" weight="medium">
          {title}
        </Text>
        <Text variant="footnote" tone="muted">
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.xl,
    borderWidth: borderWidth.hairline,
  },
  text: { flex: 1, gap: space[0.5] },
});
