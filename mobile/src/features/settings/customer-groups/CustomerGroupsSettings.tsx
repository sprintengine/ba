import { FlashList } from "@shopify/flash-list";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Info, Plus, UsersRound } from "lucide-react-native";
import type { CustomerGroup } from "@shared/api/types";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useBusinessContext } from "@shared/business/business-context";
import { nextSortOrder } from "@shared/dashboard/sort-order";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { Banner, Card, EmptyState, ErrorState, GroupedItem, GroupTitle, IconButton, Skeleton } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { SettingsPage, SettingsPageHeader } from "../SettingsPage";
import { GroupRow } from "./GroupRow";
import { GroupSheet } from "./GroupSheet";
import { groupRows, type GroupRow as Row } from "./groups";

/** What the sheet shows: a new group (null) or one to edit; `key` remounts it fresh each time it opens. */
type Editing = { key: number; group: CustomerGroup | null };

/**
 * Settings › Customer groups (the website's GroupsSettings): groups with their own hours or services, active ones
 * first then the inactive; add, edit (name, description, restricted, active) and delete from a sheet.
 */
export function CustomerGroupsSettings() {
  const { business } = useBusinessContext();
  const groups = useCustomerGroups(business.id);
  const [editing, setEditing] = useState<Editing | null>(null);
  const refetch = groups.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const list = groups.data ?? [];
  const rows = groupRows(list);
  const open = useCallback(
    (group: CustomerGroup | null) => setEditing((e) => ({ key: (e?.key ?? 0) + 1, group })),
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      if (item.kind === "header") return <GroupTitle title={item.title} />;
      const prev = rows[index - 1];
      const next = rows[index + 1];
      return (
        <GroupedItem
          first={!prev || prev.kind === "header"}
          last={!next || next.kind === "header"}
          dashed={!item.group.isActive}
        >
          <GroupRow group={item.group} onPress={open} />
        </GroupedItem>
      );
    },
    [rows, open],
  );

  return (
    <SettingsPage
      segment="customer-groups"
      scroll={false}
      headerRight={() => (
        <HeaderActions business={business.slug}>
          <IconButton
            icon={Plus}
            accessibilityLabel="New group"
            color="brand"
            onPress={() => open(null)}
            testID="group-new"
          />
        </HeaderActions>
      )}
    >
      <FlashList
        testID="groups-list"
        data={groups.isError && !groups.data ? [] : rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        ListHeaderComponent={<Header />}
        ListEmptyComponent={
          groups.isError && !groups.data ? (
            <ErrorState error={groups.error} onRetry={() => void refetch()} />
          ) : groups.data ? (
            <Empty />
          ) : (
            <Loading />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
      {editing ? (
        <GroupSheet
          key={editing.key}
          group={editing.group}
          nextSort={nextSortOrder(list)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SettingsPage>
  );
}

function Header() {
  const { v } = useVocabulary();
  return (
    <View style={[styles.width, styles.header]}>
      <SettingsPageHeader segment="customer-groups" />
      <Banner tone="info" icon={Info} title="How groups work">
        {`Groups let some ${v("customers")} see different hours or services. A GP practice might have “Private patients” and “Medical card holders”: mark medical card holders as restricted, then list them on the weekly hours kept for them. Restricted groups only see hours that name them, and nobody can pick a restricted group for themselves — you assign it on the ${v("customer")}'s profile.`}
      </Banner>
    </View>
  );
}

function Empty() {
  const { v } = useVocabulary();
  return (
    <View style={styles.width}>
      <Card>
        <EmptyState
          testID="groups-empty"
          icon={UsersRound}
          title="No groups"
          description={`Everyone books the same hours and services. Add a group when some ${v("customers")} need their own.`}
        />
      </Card>
    </View>
  );
}

function Loading() {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the groups"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={56} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  header: { gap: space[4], paddingBottom: space[4] },
  loading: { gap: space[2] },
});
