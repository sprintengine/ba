import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ArrowUpDown, Plus, Sparkles } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useReplaceService, useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { serviceWith } from "@shared/services/service-form";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { Button, EmptyState, ErrorState, GroupedItem, GroupTitle, IconButton, Skeleton, Text } from "~/ui";
import { HeaderButton, useSaveFeedback } from "~/ui/form";
import { layout, space } from "~/ui/tokens";
import { ServiceRow } from "./ServiceRow";
import {
  moveId,
  reconcileOrder,
  reorderChanges,
  reorderRows,
  serviceRows,
  sortServices,
  type ServiceListRow,
} from "./services";

export type ServicesListProps = {
  /** Admins: open a service in the editor (pushed on phones, beside the list on iPad). */
  onOpen: (service: Service) => void;
  /** Admins: start a new service. */
  onNew: () => void;
  /** The service open beside the list (iPad). */
  selectedId?: string | null;
  /** iPad: a smaller title, the list being a column. */
  wide?: boolean;
};

/**
 * `/dashboard/[slug]/services` (the website's ServicesList): active services by category, inactive ones on their own.
 * Admins switch a service's Public and Active from its row, open it to edit, add new ones and change the order;
 * staff see the list.
 */
export function ServicesList({ onOpen, onNew, selectedId = null, wide }: ServicesListProps) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const canEdit = perms.manageServices;
  const services = useServices(business.id);
  const replace = useReplaceService(business.id);
  const feedback = useSaveFeedback();
  const refetch = services.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);
  // The order being edited (service ids), or null when not reordering.
  const [order, setOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const sorted = sortServices(services.data ?? []);
  const ids = order ? reconcileOrder(order, sorted) : null;
  const rows = ids ? reorderRows(new Map(sorted.map((s) => [s.id, s])), ids) : serviceRows(sorted);

  const move = (id: string, delta: -1 | 1) => {
    if (ids) setOrder(moveId(ids, ids.indexOf(id), delta));
  };

  const saveOrder = async () => {
    if (!ids) return;
    const changes = reorderChanges(sorted, ids);
    if (changes.length === 0) {
      setOrder(null);
      return;
    }
    setSavingOrder(true);
    const ok = await feedback.run(async () => {
      for (const { service, sortOrder } of changes) {
        await replace.mutateAsync({ id: service.id, input: serviceWith(service, { sortOrder }) });
      }
    }, "Order saved");
    setSavingOrder(false);
    if (ok) setOrder(null);
  };

  // React Compiler memoises these (README "Performance rules"); the rows themselves are `memo`.
  const renderItem = ({ item }: { item: ServiceListRow }) => {
    if (item.kind === "header") return <GroupTitle title={item.title} first={item.first} />;
    return (
      <GroupedItem first={item.first} last={item.last} dashed={item.dashed} separatorInset={space[8]}>
        <ServiceRow
          service={item.service}
          canEdit={canEdit}
          onOpen={canEdit ? onOpen : undefined}
          selected={item.service.id === selectedId}
          reorder={item.position ? { ...item.position, onMove: move } : undefined}
        />
      </GroupedItem>
    );
  };

  const reordering = ids !== null;
  const headerRight = () =>
    reordering ? (
      <HeaderButton
        label="Done"
        primary
        loading={savingOrder}
        onPress={() => void saveOrder()}
        testID="services-reorder-done"
      />
    ) : (
      <HeaderActions business={business.slug}>
        {canEdit && sorted.length > 1 ? (
          <IconButton
            icon={ArrowUpDown}
            accessibilityLabel="Change the order"
            onPress={() => setOrder(sorted.map((s) => s.id))}
            testID="services-reorder"
          />
        ) : null}
        {canEdit ? (
          <IconButton
            icon={Plus}
            accessibilityLabel="New service"
            color="brand"
            onPress={onNew}
            testID="services-new"
          />
        ) : null}
      </HeaderActions>
    );

  return (
    <>
      <Stack.Screen options={{ title: "Services", headerLargeTitle: !wide, headerRight }} />
      {services.isError && !services.data ? (
        <View style={styles.fill}>
          <ErrorState error={services.error} onRetry={() => void refetch()} />
        </View>
      ) : (
        <FlashList
          testID="services-list"
          data={rows}
          extraData={selectedId}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.kind}
          renderItem={renderItem}
          ListHeaderComponent={
            reordering ? (
              <View style={[styles.width, styles.intro, styles.reorderBar]}>
                <Text variant="callout" tone="muted" style={styles.fill}>
                  Move services up or down. Your booking page lists them in this order.
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  label="Cancel"
                  disabled={savingOrder}
                  onPress={() => setOrder(null)}
                  testID="services-reorder-cancel"
                />
              </View>
            ) : (
              <Text variant="callout" tone="muted" style={[styles.width, styles.intro]}>
                What people can book, how long it takes and what it costs.
              </Text>
            )
          }
          ListEmptyComponent={
            services.data ? (
              <EmptyState
                testID="services-empty"
                icon={Sparkles}
                title="No services yet"
                description="Services you add show on your booking page. Add your first one with its length and price."
                action={canEdit ? { label: "New service", icon: Plus, onPress: onNew } : undefined}
              />
            ) : (
              <Loading />
            )
          }
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={reordering ? undefined : () => void onRefresh()}
        />
      )}
    </>
  );
}

function Loading() {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityLabel="Loading services"
      accessibilityRole="progressbar"
      testID="services-loading"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={72} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  intro: { paddingBottom: space[4] },
  reorderBar: { flexDirection: "row", alignItems: "center", gap: space[2] },
  loading: { gap: space[2] },
});
