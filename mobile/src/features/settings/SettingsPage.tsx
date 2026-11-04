import { Stack } from "expo-router";
import { createContext, useContext, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SETTINGS_NAV, settingsNavText } from "@shared/dashboard/nav";
import { useBusinessContext } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { HeaderActions } from "~/shell/HeaderActions";
import { Text } from "~/ui";
import { FormScroll, type FormScrollProps } from "~/ui/form";
import { space } from "~/ui/tokens";

/** True inside the iPad master–detail (`SettingsSplit`): the header says "Settings" and the page titles itself. */
export const SettingsSplitContext = createContext(false);

export function useInSettingsSplit(): boolean {
  return useContext(SettingsSplitContext);
}

export type SettingsPageProps = {
  /** The section (`SETTINGS_NAV` segment): its title and description. */
  segment: string;
  children: ReactNode;
  /** The header's right side while this section shows (a Save button); Bo and the bell otherwise. */
  headerRight?: () => ReactNode;
  width?: FormScrollProps["width"];
  testID?: string;
  /** Replaces the scrolling form body (a section that is a list). */
  scroll?: boolean;
};

/**
 * One settings section's screen: on phones its own pushed screen titled with the section's name; on iPad the detail
 * beside the sections list. Either way the section's description opens the page (the website's SettingsHeader).
 */
export function SettingsPage({
  segment,
  children,
  headerRight,
  width = "form",
  testID,
  scroll = true,
}: SettingsPageProps) {
  const embedded = useInSettingsSplit();
  const { business } = useBusinessContext();
  const text = useSettingsText(segment);
  return (
    <>
      <Stack.Screen
        options={{
          title: embedded ? "Settings" : text.label,
          headerRight: headerRight ?? (() => <HeaderActions business={business.slug} />),
        }}
      />
      {scroll ? (
        <FormScroll width={width} testID={testID ?? `settings-page-${segment}`}>
          <SettingsPageHeader segment={segment} />
          {children}
        </FormScroll>
      ) : (
        <View style={styles.fill} testID={testID ?? `settings-page-${segment}`}>
          {children}
        </View>
      )}
    </>
  );
}

/** The section's heading and description, for sections that render their own list (`scroll={false}`). */
export function SettingsPageHeader({ segment }: { segment: string }) {
  const embedded = useInSettingsSplit();
  const text = useSettingsText(segment);
  return (
    <View style={styles.header}>
      {embedded ? <Text variant="title2">{text.label}</Text> : null}
      {text.description ? (
        <Text variant="callout" tone="muted">
          {text.description}
        </Text>
      ) : null}
    </View>
  );
}

/** A section's label and description in the business's words. */
export function useSettingsText(segment: string): { label: string; description: string } {
  const { v } = useVocabulary();
  const item = SETTINGS_NAV.find((s) => s.segment === segment);
  return item ? settingsNavText(item, v) : { label: segment, description: "" };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: space[1] },
});
