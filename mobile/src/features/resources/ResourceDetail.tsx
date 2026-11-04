import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Link2, Pencil } from "lucide-react-native";
import type { Resource } from "@shared/api/types";
import { useResourceAvailability } from "@shared/api/hooks/use-resources";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { canEditAvailability } from "@shared/business/permissions";
import { RESOURCE_KIND_LABEL } from "@shared/catalog/resources";
import { nextSortOrder } from "@shared/dashboard/sort-order";
import { usePullToRefresh } from "~/api/use-refresh";
import { Badge, Banner, Button, Icon, ScreenScroll, SegmentedControl, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { ResourceSheet } from "./ResourceSheet";
import { ResourceSwatch } from "./ResourceRow";
import { TimeOff } from "./TimeOff";
import { useResourcesData } from "./use-resources-data";
import { WeeklyHours } from "./weekly-hours/WeeklyHours";

type Tab = "hours" | "exceptions";

/**
 * One resource (the website's ResourcePanel): its name, kind and linked member, then its weekly hours and its time
 * off and extra hours. Admins edit its details; admins and the linked member edit its hours. The phone's resource
 * screen and the iPad's split-view detail.
 */
export function ResourceDetail({ resource, onDeleted }: { resource: Resource; onDeleted?: () => void }) {
  const { business, role } = useBusinessContext();
  const perms = usePermissions();
  const data = useResourcesData();
  const availability = useResourceAvailability(business.id, resource.id);
  const [tab, setTab] = useState<Tab>("hours");
  const [editing, setEditing] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([availability.refetch(), data.resources.refetch(), data.team.refetch()]),
  );
  const editable = canEditAvailability(role, resource, data.myMemberId);
  const linkedTo = data.memberName(resource.memberId);

  return (
    <ScreenScroll testID="resource-detail" refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <View style={styles.header}>
        <ResourceSwatch resource={resource} size={44} />
        <View style={styles.title}>
          <View style={styles.nameRow}>
            <Text variant="title2" style={styles.name}>
              {resource.name}
            </Text>
            {!resource.isActive ? <Badge label="Inactive" /> : null}
          </View>
          <View style={styles.meta}>
            <Text variant="callout" tone="muted">
              {RESOURCE_KIND_LABEL[resource.kind]}
            </Text>
            {linkedTo ? (
              <View style={styles.linked} accessible accessibilityLabel={`Linked to ${linkedTo}`}>
                <Icon icon={Link2} size={14} color="mutedForeground" />
                <Text variant="callout" tone="muted">
                  {linkedTo}
                </Text>
              </View>
            ) : null}
          </View>
          {resource.description ? (
            <Text variant="callout" tone="muted">
              {resource.description}
            </Text>
          ) : null}
        </View>
        {perms.manageResources ? (
          <Button
            testID="resource-edit"
            size="sm"
            variant="secondary"
            icon={Pencil}
            label="Edit"
            accessibilityLabel={`Edit ${resource.name}`}
            onPress={() => setEditing(true)}
          />
        ) : null}
      </View>
      {!editable ? (
        <Banner tone="neutral">View only — you can edit hours for your own calendar.</Banner>
      ) : null}
      <SegmentedControl<Tab>
        accessibilityLabel={`${resource.name}'s availability`}
        value={tab}
        onChange={setTab}
        segments={[
          { value: "hours", label: "Weekly hours" },
          { value: "exceptions", label: "Time off" },
        ]}
      />
      {/* Kept mounted while hidden, so unsaved weekly hours survive a look at time off. */}
      <View style={tab === "hours" ? null : styles.hidden}>
        <WeeklyHours resource={resource} editable={editable} />
      </View>
      {tab === "exceptions" ? <TimeOff resourceId={resource.id} editable={editable} /> : null}
      {editing ? (
        <ResourceSheet
          resource={resource}
          onClose={() => setEditing(false)}
          team={data.team.data ?? []}
          nextSortOrder={nextSortOrder(data.list)}
          onDeleted={onDeleted}
        />
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  title: { flex: 1, gap: space[1] },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  name: { flexShrink: 1 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space[2] },
  linked: { flexDirection: "row", alignItems: "center", gap: space[1] },
  hidden: { display: "none" },
});
