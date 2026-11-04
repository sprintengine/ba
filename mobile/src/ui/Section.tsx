import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { space } from "./tokens";

export type SectionProps = {
  title: string;
  /** One plain sentence on what this part of the form decides. */
  description?: string;
  /** Something beside the title (an "Add" button). */
  action?: ReactNode;
  /** Under the fields (a secondary action). */
  footer?: ReactNode;
  children?: ReactNode;
  testID?: string;
};

/** A titled card of related fields: the website's SettingsCard and the service editor's sections. */
export function Section({ title, description, action, footer, children, testID }: SectionProps) {
  return (
    <Card testID={testID}>
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.titles}>
            <Text variant="title3">{title}</Text>
            {description ? (
              <Text variant="callout" tone="muted">
                {description}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  titles: { flex: 1, gap: space[1] },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
