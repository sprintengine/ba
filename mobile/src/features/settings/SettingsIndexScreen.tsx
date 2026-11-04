import { router, Stack, type Href } from "expo-router";
import { View } from "react-native";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { settingsNavText, visibleSettings } from "@shared/dashboard/nav";
import { useVocabulary } from "@shared/vocabulary";
import { RequireRole } from "~/shell/RequireRole";
import { Card, Divider, ListRow, ScreenScroll, Text, useLayout } from "~/ui";
import { space } from "~/ui/tokens";
import { SETTINGS_SECTIONS } from "./sections";
import { SettingsSplit } from "./SettingsSplit";

/**
 * `/dashboard/[slug]/settings`: the website's settings sections this member may open (`@shared/dashboard/nav`). On
 * iPad the list sits beside the first section (master–detail).
 */
export function SettingsIndexScreen() {
  const { business } = useBusinessContext();
  const { can } = usePermissions();
  const { v } = useVocabulary();
  const { isWide } = useLayout();
  const sections = visibleSettings(business, can);
  if (isWide) {
    return (
      <RequireRole min="admin">
        <SettingsSplit initial={null} sections={SETTINGS_SECTIONS} />
      </RequireRole>
    );
  }
  return (
    <RequireRole min="admin">
      <Stack.Screen options={{ title: "Settings", headerLargeTitle: true }} />
      <ScreenScroll testID="settings">
        <Text variant="callout" tone="muted">
          Configure how {business.name} works.
        </Text>
        <Card padding={0}>
          {sections.map((section, i) => {
            const { label, description } = settingsNavText(section, v);
            return (
              <View key={section.segment}>
                {i > 0 ? <Divider inset={space[4]} /> : null}
                <ListRow
                  testID={`settings-${section.segment}`}
                  title={label}
                  subtitle={description}
                  onPress={() =>
                    router.push(`/dashboard/${business.slug}/settings/${section.segment}` as Href)
                  }
                />
              </View>
            );
          })}
        </Card>
      </ScreenScroll>
    </RequireRole>
  );
}
