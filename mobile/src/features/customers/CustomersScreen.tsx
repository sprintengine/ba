import { FlashList } from "@shopify/flash-list";
import { router, Stack, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Search, UserPlus, Users } from "lucide-react-native";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useCreateCustomer, useInfiniteCustomers } from "@shared/api/hooks/use-customers";
import type { Customer } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Sheet,
  Skeleton,
  SplitView,
  Text,
  useLayout,
  useToast,
} from "~/ui";
import { layout, space } from "~/ui/tokens";
import { SearchField } from "~/features/bookings/BookingsList";
import { useFmt } from "~/features/bookings/fmt";
import { haptics } from "~/features/bookings/haptics";
import { HeaderNew } from "~/features/bookings/HeaderNew";
import { useKeyCommand } from "~/features/bookings/keys";
import { CustomerPanel } from "./CustomerDetail";
import { CustomerForm } from "./CustomerForm";
import { CustomerRow } from "./CustomerRow";

const NO_CUSTOMERS: Customer[] = [];

/** A customer's profile within the Customers stack. */
export function customerHref(slug: string, id: string): Href {
  return `/dashboard/${slug}/customers/${id}` as Href;
}

/**
 * `/dashboard/[slug]/customers`: everyone who has booked, searchable by name, email or phone, more as you scroll;
 * add one for people who book by phone or in person. Phones push a customer; large screens show them beside the list.
 */
export function CustomersScreen() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const { isWide } = useLayout();
  const fmt = useFmt();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const customers = useInfiniteCustomers(business.id, { q: q || undefined, limit: 50 });
  const groups = useCustomerGroups(business.id);
  const create = useCreateCustomer(business.id);
  const { refreshing, onRefresh } = usePullToRefresh(customers.refetch);
  useRefetchOnFocus(customers.refetch);
  const items = customers.data ?? NO_CUSTOMERS;
  const groupName = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.name])), [groups.data]);

  const add = useCallback(() => setAdding(true), []);
  useKeyCommand("n", add);
  const open = useCallback(
    (id: string) => (isWide ? setChosen(id) : router.push(customerHref(business.slug, id))),
    [isWide, business.slug],
  );
  const countLabel = useCallback((n: number) => `${n} ${v("booking", { count: n })}`, [v]);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerRow
        customer={item}
        fmt={fmt}
        onOpen={open}
        countLabel={countLabel}
        groupName={item.groupId ? groupName.get(item.groupId) : undefined}
        selected={isWide && item.id === chosen}
      />
    ),
    [fmt, open, countLabel, groupName, isWide, chosen],
  );

  const empty = customers.isError ? (
    <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
  ) : customers.isPending ? (
    <Loading label={`Loading ${v("customers")}`} />
  ) : q ? (
    <EmptyState
      testID="customers-empty"
      icon={Search}
      title={`No ${v("customers")} match “${q}”`}
      description="Check the spelling, or search by email or phone instead."
      action={{ label: "Clear search", onPress: () => setSearch(""), variant: "secondary" }}
    />
  ) : (
    <EmptyState
      testID="customers-empty"
      icon={Users}
      title={`No ${v("customers")} yet`}
      description={`${v("customers", { title: true })} appear here after their first ${v("booking")}. You can also add them yourself.`}
      action={{ label: `Add ${v("customer")}`, onPress: add, icon: UserPlus }}
    />
  );

  const list = (
    <FlashList
      testID="customers-list"
      data={items}
      extraData={chosen}
      keyExtractor={(c) => c.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Divider}
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchField
            testID="customers-search"
            label={`Search ${v("customers")}`}
            placeholder="Name, email or phone"
            value={search}
            onChange={setSearch}
          />
        </View>
      }
      ListEmptyComponent={empty}
      ListFooterComponent={
        customers.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footer} accessibilityLabel={`Loading more ${v("customers")}`} />
        ) : items.length > 0 && !customers.hasNextPage ? (
          <Text variant="footnote" tone="subtle" align="center" style={styles.footer}>
            {items.length} {v("customer", { count: items.length })}
          </Text>
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (customers.hasNextPage && !customers.isFetchingNextPage) void customers.fetchNextPage();
      }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );

  return (
    <Screen testID="customers-screen">
      <Stack.Screen
        options={{
          title: v("customers", { title: true }),
          headerLargeTitle: !isWide,
          headerRight: () => <HeaderNew label={`Add ${v("customer")}`} onPress={add} testID="add-customer" />,
        }}
      />
      {isWide ? (
        <SplitView
          list={list}
          detail={
            chosen ? (
              <CustomerPanel key={chosen} customerId={chosen} onErased={() => setChosen(null)} />
            ) : (
              <EmptyState
                icon={Users}
                title={`Choose a ${v("customer")}`}
                description={`Their ${v("bookings")}, details and notes show here.`}
              />
            )
          }
        />
      ) : (
        list
      )}
      <Sheet
        visible={adding}
        onClose={() => setAdding(false)}
        title={`Add a ${v("customer")}`}
        testID="add-customer-sheet"
      >
        <Text tone="muted">For people who book by phone or in person.</Text>
        {adding ? (
          <CustomerForm
            submitLabel={`Add ${v("customer")}`}
            secondary={<Button label="Cancel" variant="secondary" onPress={() => setAdding(false)} />}
            onSubmit={async (input) => {
              const c = await create.mutateAsync(input);
              haptics.success();
              toast.show(`${c.name} added`, "success");
              setAdding(false);
              open(c.id);
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={36} height={36} radius="full" />
          <View style={styles.flex}>
            <Skeleton height={14} width="50%" />
            <View style={styles.gap} />
            <Skeleton height={12} width="70%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: space[4], maxWidth: layout.maxContentWidth },
  footer: { padding: space[4] },
  flex: { flex: 1 },
  loading: { padding: space[4], gap: space[4] },
  skeletonRow: { flexDirection: "row", gap: space[3], alignItems: "center" },
  gap: { height: space[1.5] },
});
