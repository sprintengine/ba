import { StyleSheet, View } from "react-native";
import type { Resource } from "@shared/api/types";
import { useResourceAvailability } from "@shared/api/hooks/use-resources";
import { rulesToSchedules, WEEKDAYS } from "@shared/availability/weekly-hours";
import { useBusinessContext } from "@shared/business/business-context";
import { ErrorState, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { WeeklyHoursEditor } from "./WeeklyHoursEditor";

/** Loads a resource's rules and renders the weekly-hours editor once ready (the website's WeeklyHours). */
export function WeeklyHours({ resource, editable }: { resource: Resource; editable: boolean }) {
  const { business } = useBusinessContext();
  const availability = useResourceAvailability(business.id, resource.id);
  if (availability.isPending) {
    return (
      <View
        style={styles.loading}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading hours"
      >
        {WEEKDAYS.map((d) => (
          <Skeleton key={d.day} height={52} radius="lg" />
        ))}
      </View>
    );
  }
  if (availability.isError) {
    return <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />;
  }
  // Start the editor afresh when the saved rules change (a save, another member's edit), not on every refetch, which
  // would throw away unsaved edits (pull to refresh, time off added).
  return (
    <WeeklyHoursEditor
      key={JSON.stringify(availability.data.rules)}
      resourceId={resource.id}
      initial={rulesToSchedules(availability.data.rules)}
      editable={editable}
    />
  );
}

const styles = StyleSheet.create({ loading: { gap: space[2] } });
