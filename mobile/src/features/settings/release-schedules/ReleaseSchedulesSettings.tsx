import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarClock, LockOpen, Plus } from "lucide-react-native";
import type { ReleaseSchedule } from "@shared/api/types";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useReleaseSchedules } from "@shared/api/hooks/use-releases";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import { DEFAULT_LOCALE } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { Banner, Card, EmptyState, ErrorState, Icon, IconButton, Skeleton, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { bookableServices, uncoveredNote } from "./releases";
import { ReleaseScheduleEditor } from "./ReleaseScheduleEditor";
import { ScheduleCard } from "./ScheduleCard";
import { UpcomingReleases } from "./UpcomingReleases";

/** What the editor shows: a new schedule (null) or one to edit; `key` remounts it fresh each time it opens. */
type Editing = { key: number; schedule: ReleaseSchedule | null };

/**
 * Settings › Release schedules (§21; the website's ReleaseSettings): each schedule in a sentence, the services no
 * schedule covers, and the next fortnight's releases with one-off changes. At most 20 schedules (the API says so).
 */
export function ReleaseSchedulesSettings() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const schedules = useReleaseSchedules(business.id);
  const services = useServices(business.id);
  const groups = useCustomerGroups(business.id);
  const [editing, setEditing] = useState<Editing | null>(null);
  useRefetchOnFocus(schedules.refetch);

  const bookable = bookableServices(services.data);
  const list = schedules.data ?? [];
  const locale = business.locale || DEFAULT_LOCALE;
  const open = useCallback(
    (schedule: ReleaseSchedule | null) => setEditing((e) => ({ key: (e?.key ?? 0) + 1, schedule })),
    [],
  );
  const note = uncoveredNote(list, bookable);

  return (
    <SettingsPage
      segment="release-schedules"
      width="content"
      headerRight={() => (
        <HeaderActions business={business.slug}>
          <IconButton
            icon={Plus}
            accessibilityLabel="New schedule"
            color={bookable.length === 0 ? "subtleForeground" : "brand"}
            disabled={bookable.length === 0}
            accessibilityState={{ disabled: bookable.length === 0 }}
            onPress={() => open(null)}
            testID="release-new"
          />
        </HeaderActions>
      )}
    >
      <Banner tone="info" icon={CalendarClock} title="How releases work">
        {`A schedule keeps each day closed to online booking until it opens: the day before at 17:00, say, or a whole week every Friday night. Change one day's release here or from the calendar — open it now, move it, or hold it until you're ready. Your team can always book any free time, and ${v("customers")} see when a closed day opens.`}
      </Banner>
      {schedules.isError && !schedules.data ? (
        <ErrorState error={schedules.error} onRetry={() => void schedules.refetch()} />
      ) : !schedules.data || services.isPending ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading the release schedules">
          <Skeleton height={160} radius="xl" />
        </View>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            testID="release-empty"
            icon={CalendarClock}
            title="No release schedules"
            description="Every day can be booked as far ahead as your policies allow. Add a schedule to open days at a set time."
            action={
              bookable.length > 0
                ? { label: "New schedule", icon: Plus, onPress: () => open(null) }
                : undefined
            }
          />
        </Card>
      ) : (
        <>
          <View style={styles.cards}>
            {list.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                services={services.data ?? []}
                groups={groups.data ?? []}
                locale={locale}
                onEdit={open}
              />
            ))}
            {note ? <UncoveredNote text={note} /> : null}
          </View>
          <UpcomingReleases schedules={list.filter((s) => s.status === "active")} />
        </>
      )}
      {editing ? (
        <ReleaseScheduleEditor
          key={editing.key}
          schedule={editing.schedule}
          services={bookable}
          groups={(groups.data ?? []).filter((g) => g.isActive)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SettingsPage>
  );
}

/** The bookable services no active schedule covers: they open as far ahead as the policies allow. */
function UncoveredNote({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.uncovered, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceSunken }]}
      accessible
      accessibilityLabel={text}
      testID="release-uncovered"
    >
      <Icon icon={LockOpen} size={16} color="mutedForeground" />
      <Text variant="callout" tone="muted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: space[3] },
  uncovered: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: borderWidth.hairline,
    borderStyle: "dashed",
    borderRadius: radius.xl,
  },
  flex: { flex: 1 },
});
