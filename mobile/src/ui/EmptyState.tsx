import { StyleSheet, View } from "react-native";
import { Button, type ButtonProps } from "./Button";
import { Icon, type IconComponent } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { layout, radius, space } from "./tokens";

export type EmptyStateProps = {
  icon?: IconComponent;
  title: string;
  description?: string;
  /** One clear next step. */
  action?: Pick<ButtonProps, "label" | "onPress" | "icon" | "variant">;
  testID?: string;
};

/** What a screen shows when there is nothing yet: say why, and the way forward. */
export function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.root} testID={testID}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
          <Icon icon={icon} size={26} color="brandSoftForeground" />
        </View>
      ) : null}
      <Text variant="title3" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="callout" tone="muted" align="center">
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button variant="secondary" {...action} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[6],
    paddingVertical: space[10],
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
  icon: {
    width: space[16],
    height: space[16],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[2],
  },
  action: { marginTop: space[3] },
});
