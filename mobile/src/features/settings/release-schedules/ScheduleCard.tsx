import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarClock, ChevronRight } from "lucide-react-native";
import type { CustomerGroup, ReleaseSchedule, Service } from "@shared/api/types";
import { scheduleSummary, servicesLabel, whoLabel } from "@shared/releases/text";
import { Badge, Card, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/** One schedule in a sentence, with what and whom it covers (the website's ScheduleCard); opens the editor. */
export const ScheduleCard = memo(function ScheduleCard({
  schedule,
  services,
  groups,
  locale,
  onEdit,
}: {
  schedule: ReleaseSchedule;
  services: Service[];
  groups: CustomerGroup[];
  locale: string;
  onEdit: (schedule: ReleaseSchedule) => void;
}) {
  const { colors } = useTheme();
  const paused = schedule.status === "paused";
  const status = paused ? "Paused" : "Active";
  const summary = scheduleSummary(schedule, locale);
  const covers = `${servicesLabel(schedule.serviceIds, services)} · ${whoLabel(schedule, groups)}`;
  return (
    <Card
      onPress={() => onEdit(schedule)}
      accessibilityLabel={`${schedule.name}, ${status}. ${summary} ${covers}`}
      accessibilityHint="Edit the schedule"
      testID={`release-schedule-${schedule.id}`}
    >
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
          <Icon icon={CalendarClock} size={18} color="brandSoftForeground" />
        </View>
        <View style={styles.text}>
          <View style={styles.title}>
            <Text weight="semibold" style={styles.name}>
              {schedule.name}
            </Text>
            <Badge label={status} tone={paused ? "neutral" : "success"} />
          </View>
          <Text variant="callout">{summary}</Text>
          <Text variant="footnote" tone="muted">
            {covers}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={18} color="subtleForeground" />
      </View>
    </Card>
  );
});

const TILE = space[10];

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: space[1] },
  title: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  name: { flexShrink: 1 },
});
