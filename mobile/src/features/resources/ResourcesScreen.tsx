import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Boxes, Plus } from "lucide-react-native";
import type { Resource } from "@shared/api/types";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { nextSortOrder } from "@shared/dashboard/sort-order";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import {
  EmptyState,
  ErrorState,
  GroupedItem,
  GroupTitle,
  IconButton,
  Screen,
  Skeleton,
  SplitView,
  Text,
  useLayout,
} from "~/ui";
import { UnsavedChangesScope, useConfirmLeave } from "~/ui/form";
import { layout, space } from "~/ui/tokens";
import { ResourceDetail } from "./ResourceDetail";
import { ResourceRow } from "./ResourceRow";
import { ResourceSheet } from "./ResourceSheet";
import { resourceRows, type ResourceListRow } from "./resources";
import { Closures } from "./TimeOff";
import { useResourcesData } from "./use-resources-data";

/**
 * `/dashboard/[slug]/resources` (the website's ResourcesView): the people, rooms and equipment that get booked, active
 * first, and the business's closed days. Phones: a resource opens on its own screen (weekly hours, time off). Large
 * screens: the list beside the open resource. Admins add, edit and delete resources; staff edit their own hours.
 */
export function ResourcesScreen() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const { isWide } = useLayout();
  const data = useResourcesData();
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const refetch = data.resources.refetch;
  useRefetchOnFocus(refetch);

  const selected = isWide ? (data.list.find((r) => r.id === chosen) ?? data.list[0]) : undefined;
  const title = v("resources", { title: true });

  const header = (
    <Stack.Screen
      options={{
        title,
        headerLargeTitle: !isWide,
        headerRight: () => (
          <HeaderActions business={business.slug}>
            {perms.manageResources ? (
              <IconButton
                icon={Plus}
                accessibilityLabel={`Add a ${v("resource")}`}
                color="brand"
                onPress={() => setAdding(true)}
                testID="resource-add"
              />
            ) : null}
          </HeaderActions>
        ),
      }}
    />
  );

  const sheet = adding ? (
    <ResourceSheet
      resource={null}
      onClose={() => setAdding(false)}
      team={data.team.data ?? []}
      nextSortOrder={nextSortOrder(data.list)}
      onSaved={(r) => {
        if (isWide) setChosen(r.id);
      }}
    />
  ) : null;

  const list = (
    <ResourcesList
      selectedId={selected?.id ?? null}
      wide={isWide}
      onAdd={() => setAdding(true)}
      onOpen={(r) => {
        if (isWide) setChosen(r.id);
        else router.push(`/dashboard/${business.slug}/resources/${r.id}`);
      }}
    />
  );

  if (!isWide) {
    return (
      <Screen testID="resources">
        {header}
        {list}
        {sheet}
      </Screen>
    );
  }
  return (
    <Screen testID="resources">
      {header}
      <UnsavedChangesScope>
        <SplitView
          list={list}
          detail={
            selected ? (
              <ResourceDetail key={selected.id} resource={selected} onDeleted={() => setChosen(null)} />
            ) : (
              <EmptyState
                icon={Boxes}
                title={`Choose a ${v("resource")}`}
                description="Its weekly hours and time off show here."
              />
            )
          }
        />
      </UnsavedChangesScope>
      {sheet}
    </Screen>
  );
}

/** The resources, active first, then the inactive ones, and (admins) the business's closed days. */
function ResourcesList({
  selectedId,
  wide,
  onOpen,
  onAdd,
}: {
  selectedId: string | null;
  wide: boolean;
  onOpen: (resource: Resource) => void;
  onAdd: () => void;
}) {
  const perms = usePermissions();
  const { v } = useVocabulary();
  const data = useResourcesData();
  const confirmLeave = useConfirmLeave();
  const { resources, team } = data;
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([resources.refetch(), team.refetch()]),
  );
  const rows = resourceRows(data.list);

  // In a split view, switching resources asks first when the open one has unsaved hours.
  const open = useCallback(
    async (r: Resource) => {
      if (r.id === selectedId) return;
      if (!wide || (await confirmLeave())) onOpen(r);
    },
    [wide, selectedId, confirmLeave, onOpen],
  );

  const renderItem = useCallback(
    ({ item }: { item: ResourceListRow }) => {
      if (item.kind === "header") return <GroupTitle title={item.title} />;
      return (
        <GroupedItem
          first={item.first}
          last={item.last}
          separatorInset={space[16]}
          dashed={!item.resource.isActive}
        >
          <ResourceRow
            resource={item.resource}
            linkedTo={data.memberName(item.resource.memberId)}
            selected={item.resource.id === selectedId}
            chevron={!wide}
            onPress={(r) => void open(r)}
          />
        </GroupedItem>
      );
    },
    // The team (for names) changes with its query; rows are memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team.data, selectedId, wide, open],
  );

  if (resources.isError && !resources.data) {
    return (
      <View style={styles.fill}>
        <ErrorState error={resources.error} onRetry={() => void resources.refetch()} />
      </View>
    );
  }

  return (
    <FlashList
      testID="resources-list"
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.kind}
      renderItem={renderItem}
      extraData={selectedId}
      ListHeaderComponent={
        <Text variant="callout" tone="muted" style={[styles.width, styles.intro]}>
          {perms.manageResources
            ? "The people, rooms and equipment that get booked, and when each one is available."
            : "Your working hours and time off."}
        </Text>
      }
      ListEmptyComponent={
        resources.data ? (
          <View style={styles.width}>
            <EmptyState
              testID="resources-empty"
              icon={Boxes}
              title={perms.manageResources ? `No ${v("resources")} yet` : "You're not linked to a calendar"}
              description={
                perms.manageResources
                  ? `Add who or what gets booked. Each ${v("resource")} has its own hours and calendar column.`
                  : "Ask an admin to link you to your calendar in Team settings."
              }
              action={
                perms.manageResources
                  ? { label: `Add ${v("resource")}`, icon: Plus, onPress: onAdd }
                  : undefined
              }
            />
          </View>
        ) : (
          <Loading label={`Loading ${v("resources")}`} />
        )
      }
      ListFooterComponent={
        perms.manageClosures && resources.data ? (
          <View style={[styles.width, styles.closures]}>
            <Closures editable />
          </View>
        ) : null
      }
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={68} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  intro: { paddingBottom: space[4] },
  closures: { paddingTop: space[10] },
  loading: { gap: space[2] },
});
