import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarOff, Plus, SunMedium } from "lucide-react-native";
import {
  useClosures,
  useCreateClosure,
  useCreateResourceOverride,
  useResourceAvailability,
} from "@shared/api/hooks/use-resources";
import { useBusinessContext } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { Button, EmptyState, ErrorState, Skeleton, Text } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { OverrideList } from "./OverrideList";
import { OverrideSheet } from "./OverrideSheet";
import { upcomingOverrides } from "./resources";

/** A resource's date exceptions (the website's TimeOff): days off, part of a day off, extra hours. */
export function TimeOff({ resourceId, editable }: { resourceId: string; editable: boolean }) {
  const { business } = useBusinessContext();
  const availability = useResourceAvailability(business.id, resourceId);
  const create = useCreateResourceOverride(business.id, resourceId);
  const feedback = useSaveFeedback();
  const [adding, setAdding] = useState(false);
  const today = todayInTz(business.timezone);

  if (availability.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading time off">
        <Skeleton height={160} radius="xl" />
      </View>
    );
  }
  if (availability.isError) {
    return <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />;
  }
  return (
    <View style={styles.root} testID="time-off">
      <View style={styles.header}>
        <Text variant="callout" tone="muted" style={styles.intro}>
          Holidays, appointments, one-off late nights. These override the weekly hours on that date.
        </Text>
        {editable ? (
          <Button
            testID="time-off-add"
            size="sm"
            variant="secondary"
            icon={Plus}
            label="Add"
            accessibilityLabel="Add time off or extra hours"
            onPress={() => setAdding(true)}
          />
        ) : null}
      </View>
      <OverrideList
        items={upcomingOverrides(availability.data.overrides, today)}
        editable={editable}
        empty={
          <EmptyState
            icon={SunMedium}
            title="Nothing planned"
            description="No time off or extra hours coming up."
          />
        }
      />
      {editable ? (
        <OverrideSheet
          visible={adding}
          onClose={() => setAdding(false)}
          allowExtra
          title="Add time off or extra hours"
          testID="time-off"
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            feedback.saved("Added");
          }}
        />
      ) : null}
    </View>
  );
}

/** Business-wide closures (the website's Closures): bank holidays and the like, admins only. */
export function Closures({ editable }: { editable: boolean }) {
  const { business } = useBusinessContext();
  const closures = useClosures(business.id);
  const create = useCreateClosure(business.id);
  const feedback = useSaveFeedback();
  const [adding, setAdding] = useState(false);
  const today = todayInTz(business.timezone);

  return (
    <View style={styles.root} testID="closures">
      <View style={styles.header}>
        <View style={styles.intro}>
          <Text variant="title3">Closed days</Text>
          <Text variant="callout" tone="muted">
            When the whole business is closed — nobody can be booked.
          </Text>
        </View>
        {editable ? (
          <Button
            testID="closure-add"
            size="sm"
            variant="secondary"
            icon={CalendarOff}
            label="Add closure"
            onPress={() => setAdding(true)}
          />
        ) : null}
      </View>
      {closures.isPending ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading closed days">
          <Skeleton height={96} radius="xl" />
        </View>
      ) : closures.isError ? (
        <ErrorState error={closures.error} onRetry={() => void closures.refetch()} />
      ) : (
        <OverrideList
          items={upcomingOverrides(closures.data, today)}
          editable={editable}
          empty={
            <EmptyState
              icon={CalendarOff}
              title="No closures planned"
              description="Add bank holidays or a team day out."
            />
          }
        />
      )}
      {editable ? (
        <OverrideSheet
          visible={adding}
          onClose={() => setAdding(false)}
          title="Close the business"
          testID="closure"
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            feedback.saved("Closure added");
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[3] },
  intro: { flex: 1, minWidth: 200, gap: space[1] },
});
