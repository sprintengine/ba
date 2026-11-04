import { FlashList } from "@shopify/flash-list";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Clock, RotateCw, SearchX } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { searchCenter, useMarketplaceMeta, useMarketplaceSearch } from "@shared/api/hooks/use-marketplace";
import type { Listing, MarketplaceSearchResult } from "@shared/api/types";
import {
  clearRefinements,
  DEFAULT_FILTERS,
  effectiveRadiusKm,
  hasRefinements,
  panelFilterCount,
  parseExploreParams,
  roundCoordinate,
  sanitizeFilters,
  widerRadiusKm,
  type ExploreFilters,
  type ExplorePreset,
} from "@shared/explore/filters";
import { toMarketplaceQuery } from "@shared/explore/query";
import { usePullToRefresh } from "~/api/use-refresh";
import { Button, EmptyState, ErrorState, Screen, Text, useLayout, useTheme } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { paramsToSearch } from "~/features/booking/params";
import { CategoryChips, FiltersButton, LocationControls, SearchField } from "./ExploreControls";
import { describeScope, emptyDescription } from "./explore";
import { ListingCard, ListingCardSkeleton } from "./ListingCard";
import { useNearMe } from "./use-near-me";

const PANEL_DEFAULTS = {
  available: "any",
  minPrice: null,
  maxPrice: null,
  deals: false,
  radiusKm: null,
} satisfies Partial<ExploreFilters>;

/**
 * `/explore` (and the website's `/explore/[city]/[category]` links): search businesses by what, where (a city or near
 * me) and when, with categories, price and deals filters; results with their next free times, more as you scroll.
 * Two columns on large screens.
 */
export function ExploreScreen({ preset = {} }: { preset?: ExplorePreset }) {
  const params = useLocalSearchParams();
  const { isWide } = useLayout();
  const [chosen, setChosen] = useState<ExploreFilters>(() =>
    parseExploreParams(paramsToSearch(params), preset),
  );
  const meta = useMarketplaceMeta();
  const filters = sanitizeFilters(chosen, meta.data);
  const search = useMarketplaceSearch(toMarketplaceQuery(filters));
  const change = (patch: Partial<ExploreFilters>) => setChosen((f) => ({ ...f, ...patch }));
  const nearMe = useNearMe(({ latitude, longitude }) =>
    change({
      location: { kind: "near", lat: roundCoordinate(latitude), lng: roundCoordinate(longitude) },
      radiusKm: null,
    }),
  );
  const { refreshing, onRefresh } = usePullToRefresh(search.refetch);

  const pages = search.data?.pages as MarketplaceSearchResult[] | undefined;
  const items = pages?.flatMap((p) => p.items) ?? [];
  const centerLabel = searchCenter(pages)?.label ?? null;
  const radius = effectiveRadiusKm(filters);
  const wider = radius !== null ? widerRadiusKm(radius) : null;

  const open = useCallback((listing: Listing) => {
    router.push({ pathname: "/[slug]", params: { slug: listing.business.slug } });
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: Listing }) => (
      <View style={styles.item}>
        <ListingCard listing={item} onOpen={open} />
      </View>
    ),
    [open],
  );

  const header = (
    <View style={styles.header}>
      <SearchField value={filters.q} onCommit={(q) => change({ q })} />
      <LocationControls
        filters={filters}
        meta={meta.data}
        nearMe={nearMe.state}
        onCity={(slug) => {
          nearMe.dismiss();
          change({ location: slug ? { kind: "city", slug } : { kind: "anywhere" }, radiusKm: null });
        }}
        onNearMe={() => void nearMe.locate()}
        onDismiss={nearMe.dismiss}
      />
      <CategoryChips
        categories={meta.data?.categories}
        loading={meta.isPending}
        value={filters.category}
        onChange={(category) => change({ category })}
      />
      <View style={styles.scope}>
        <Text
          variant="callout"
          tone="muted"
          style={styles.flex}
          accessibilityRole="header"
          testID="explore-scope"
        >
          {describeScope(filters, meta.data, centerLabel)}
        </Text>
        <FiltersButton
          filters={filters}
          activeCount={panelFilterCount(filters)}
          onApply={change}
          onClear={() => change(PANEL_DEFAULTS)}
        />
      </View>
      {search.isFetched && items.length > 0 ? (
        <Text variant="footnote" tone="subtle" accessibilityLiveRegion="polite" style={styles.srOnly}>
          {items.length === 1 ? "1 result" : `${items.length} results`}
          {search.hasNextPage ? ", more available" : ""}
        </Text>
      ) : null}
    </View>
  );

  const suggestions: { label: string; onPress: () => void }[] = [];
  if (hasRefinements(filters))
    suggestions.push({ label: "Clear filters", onPress: () => setChosen(clearRefinements(filters)) });
  if (wider !== null)
    suggestions.push({ label: `Widen to ${wider} km`, onPress: () => change({ radiusKm: wider }) });
  if (filters.location.kind !== "anywhere")
    suggestions.push({
      label: "Search all of Ireland",
      onPress: () => change({ location: { kind: "anywhere" }, radiusKm: null }),
    });

  const empty = search.isPending ? (
    <View
      style={styles.loading}
      accessible
      accessibilityLabel="Loading results"
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </View>
  ) : search.isError && !search.data ? (
    <ResultsError
      error={search.error}
      onRetry={() => void search.refetch()}
      onReset={() => setChosen(DEFAULT_FILTERS)}
    />
  ) : (
    <View testID="explore-empty">
      <EmptyState
        icon={SearchX}
        title="Nothing matches yet"
        description={emptyDescription(filters, meta.data, centerLabel)}
      />
      <View style={styles.suggestions}>
        {suggestions.map((s, i) => (
          <Button
            key={s.label}
            variant={i === 0 ? "primary" : "secondary"}
            label={s.label}
            onPress={s.onPress}
          />
        ))}
      </View>
    </View>
  );

  return (
    <Screen testID="explore">
      <Stack.Screen options={{ title: "Explore", headerLargeTitle: !isWide }} />
      <FlashList
        testID="explore-results"
        key={isWide ? "wide" : "narrow"}
        data={items}
        numColumns={isWide ? 2 : 1}
        keyExtractor={(l) => l.business.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          items.length > 0 ? (
            <Footer
              loading={search.isFetchingNextPage}
              failed={search.isFetchNextPageError}
              error={search.error}
              onRetry={() => void search.fetchNextPage()}
            />
          ) : null
        }
        onEndReached={() => {
          if (search.hasNextPage && !search.isFetchingNextPage && !search.isFetchNextPageError)
            void search.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={isWide ? styles.contentWide : styles.content}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    </Screen>
  );
}

function Footer({
  loading,
  failed,
  error,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  if (failed) {
    return (
      <View style={styles.footer} accessibilityRole="alert">
        <Text variant="callout" tone="muted" align="center">
          {errorMessage(error, "We couldn't load more results.")}
        </Text>
        <Button variant="secondary" icon={RotateCw} label="Try again" onPress={onRetry} />
      </View>
    );
  }
  return (
    <View style={styles.footer}>
      {loading ? (
        <ActivityIndicator color={colors.mutedForeground} accessibilityLabel="Loading more results" />
      ) : null}
    </View>
  );
}

function ResultsError({
  error,
  onRetry,
  onReset,
}: {
  error: unknown;
  onRetry: () => void;
  onReset: () => void;
}) {
  if (isApiError(error) && error.code === "RATE_LIMITED") {
    return (
      <EmptyState
        icon={Clock}
        title="Lots of searches in a short time"
        description="Give it a few seconds, then try again. Your filters are saved."
        action={{ label: "Try again", icon: RotateCw, onPress: onRetry }}
      />
    );
  }
  if (isApiError(error) && error.code === "INVALID_REQUEST") {
    return (
      <EmptyState
        icon={SearchX}
        title="Those filters don't work together"
        description={errorMessage(error)}
        action={{ label: "Reset filters", onPress: onReset, variant: "primary" }}
      />
    );
  }
  return <ErrorState error={error} title="We couldn't load results" onRetry={onRetry} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space[4] },
  contentWide: { padding: space[6] },
  header: { gap: space[4], paddingBottom: space[4], maxWidth: layout.maxContentWidth * 2, width: "100%" },
  scope: { flexDirection: "row", alignItems: "center", gap: space[2] },
  srOnly: { height: 1, overflow: "hidden", opacity: 0 },
  item: { paddingBottom: space[3], paddingHorizontal: space[1.5] },
  loading: { gap: space[3] },
  suggestions: { alignItems: "center", gap: space[2] },
  footer: { alignItems: "center", gap: space[3], paddingVertical: space[6] },
});
