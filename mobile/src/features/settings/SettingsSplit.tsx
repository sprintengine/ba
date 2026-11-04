import { Stack } from "expo-router";
import { useState, type ComponentType } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { settingsNavText, visibleSettings } from "@shared/dashboard/nav";
import { useVocabulary } from "@shared/vocabulary";
import { RequireRole } from "~/shell/RequireRole";
import { Card, Divider, ListRow, SplitView, useTheme } from "~/ui";
import { UnsavedChangesScope, useConfirmLeave } from "~/ui/form";
import { space } from "~/ui/tokens";
import { SettingsSplitContext } from "./SettingsPage";

export type SettingsSections = Record<string, ComponentType>;

/**
 * Settings on iPad: the sections list beside the open section (master–detail), like the iPad Settings app. Picking
 * another section swaps the detail in place (asking first if the open one has unsaved changes); the list keeps its
 * scroll position. Phones use one screen per section instead (`/settings/<segment>`).
 */
export function SettingsSplit({ initial, sections }: { initial: string | null; sections: SettingsSections }) {
  const { business } = useBusinessContext();
  const { can } = usePermissions();
  const visible = visibleSettings(business, can);
  const fallback = visible[0]?.segment ?? null;
  const [selected, setSelected] = useState<string | null>(
    initial && visible.some((s) => s.segment === initial) ? initial : fallback,
  );
  const item = visible.find((s) => s.segment === selected);
  const Detail = selected ? sections[selected] : undefined;
  return (
    <UnsavedChangesScope>
      <Stack.Screen options={{ title: "Settings", headerLargeTitle: false }} />
      <SplitView
        list={<SectionsList selected={selected} onSelect={setSelected} />}
        detail={
          <SettingsSplitContext.Provider value>
            {Detail && item ? (
              <RequireRole min={item.minRole}>
                <Detail key={selected} />
              </RequireRole>
            ) : null}
          </SettingsSplitContext.Provider>
        }
      />
    </UnsavedChangesScope>
  );
}

function SectionsList({ selected, onSelect }: { selected: string | null; onSelect: (s: string) => void }) {
  const { business } = useBusinessContext();
  const { can } = usePermissions();
  const { v } = useVocabulary();
  const { colors } = useTheme();
  const confirmLeave = useConfirmLeave();
  const sections = visibleSettings(business, can);
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      testID="settings"
    >
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
                selected={section.segment === selected}
                chevron={false}
                onPress={async () => {
                  if (section.segment === selected) return;
                  if (await confirmLeave()) onSelect(section.segment);
                }}
              />
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ list: { padding: space[4] } });
