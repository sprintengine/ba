/** Explore's controls: search, location (city or near me), categories and the filters sheet. */
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, LayoutGrid, LocateFixed, MapPin, SlidersHorizontal, X } from "lucide-react-native";
import type { MarketplaceCategory, MarketplaceCity, MarketplaceMeta } from "@shared/api/types";
import {
  effectiveRadiusKm,
  radiusOptions,
  type ExploreAvailability,
  type ExploreFilters,
} from "@shared/explore/filters";
import { formatListingCount } from "@shared/explore/format";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import {
  Button,
  Icon,
  ListRow,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Text,
  TextField,
  useTheme,
} from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space } from "~/ui/tokens";
import { Callout } from "~/features/booking/Callout";
import { categoryIcon, euroText, locationLabel, parseEuro } from "./explore";
import type { NearMeState } from "./use-near-me";

/** Free-text search: commits once typing pauses (and on the keyboard's Search); follows outside changes. */
export function SearchField({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const debounced = useDebouncedValue(text.trim(), 400);
  if (synced !== value) {
    setSynced(value);
    if (value !== debounced) setText(value);
  }
  useEffect(() => {
    if (debounced !== value) onCommit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);
  return (
    <TextField
      testID="explore-search"
      label="Search businesses and services"
      placeholder="Physio, haircut, car wash…"
      value={text}
      onChangeText={setText}
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      onSubmitEditing={() => onCommit(text.trim())}
    />
  );
}

/** The location button (city sheet) and Near me, with a dismissible problem. */
export function LocationControls({
  filters,
  meta,
  nearMe,
  onCity,
  onNearMe,
  onDismiss,
}: {
  filters: ExploreFilters;
  meta: MarketplaceMeta | undefined;
  nearMe: NearMeState;
  onCity: (slug: string | null) => void;
  onNearMe: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const near = filters.location.kind === "near";
  return (
    <View style={styles.location}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button
            testID="explore-location"
            variant="secondary"
            icon={MapPin}
            label={locationLabel(filters, meta)}
            accessibilityLabel={`Location: ${locationLabel(filters, meta)}`}
            accessibilityHint="Choose a city"
            disabled={!meta}
            fullWidth
            onPress={() => setOpen(true)}
          />
        </View>
        <Button
          testID="explore-near-me"
          variant={near ? "brand" : "secondary"}
          icon={LocateFixed}
          label="Near me"
          accessibilityState={{ selected: near, busy: nearMe.status === "locating" }}
          loading={nearMe.status === "locating"}
          onPress={onNearMe}
        />
      </View>
      {nearMe.status === "error" ? (
        <Callout
          tone="warning"
          alert
          testID="near-me-error"
          action={
            <>
              {nearMe.reason === "denied" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  label="Open Settings"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
              <Button variant="ghost" size="sm" icon={X} label="Dismiss" onPress={onDismiss} />
            </>
          }
        >
          {nearMe.message}
        </Callout>
      ) : null}
      <CitySheet
        visible={open}
        cities={meta?.cities ?? []}
        current={
          filters.location.kind === "city"
            ? filters.location.slug
            : filters.location.kind === "anywhere"
              ? ""
              : null
        }
        onClose={() => setOpen(false)}
        onChoose={(slug) => {
          setOpen(false);
          onCity(slug);
        }}
      />
    </View>
  );
}

function CitySheet({
  visible,
  cities,
  current,
  onClose,
  onChoose,
}: {
  visible: boolean;
  cities: MarketplaceCity[];
  /** A city's slug, "" for all of Ireland, null near you. */
  current: string | null;
  onClose: () => void;
  onChoose: (slug: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? cities.filter((c) => `${c.name} ${c.county}`.toLowerCase().includes(q)) : cities;
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a city" testID="city-sheet">
      <TextField
        label="Search cities"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        placeholder="Galway, Cork…"
      />
      <ListRow
        testID="city-anywhere"
        icon={MapPin}
        title="All of Ireland"
        chevron={false}
        selected={current === ""}
        trailing={current === "" ? <Icon icon={Check} color="brand" /> : undefined}
        onPress={() => onChoose(null)}
      />
      {shown.map((c) => (
        <ListRow
          key={c.slug}
          testID={`city-${c.slug}`}
          title={c.name}
          subtitle={formatListingCount(c.listingCount)}
          chevron={false}
          selected={current === c.slug}
          trailing={current === c.slug ? <Icon icon={Check} color="brand" /> : undefined}
          onPress={() => onChoose(c.slug)}
        />
      ))}
      {shown.length === 0 ? (
        <Text variant="callout" tone="muted" align="center">
          No city by that name yet.
        </Text>
      ) : null}
    </Sheet>
  );
}

/** Horizontally scrolling category toggles ("All" + one per category). */
export function CategoryChips({
  categories,
  loading,
  value,
  onChange,
}: {
  categories: MarketplaceCategory[] | undefined;
  loading: boolean;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  if (loading) {
    return (
      <View style={styles.chips} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[64, 112, 96, 128].map((w, i) => (
          <Skeleton key={i} width={w} height={MIN_TOUCH - space[1]} radius="full" />
        ))}
      </View>
    );
  }
  if (!categories?.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityLabel="Categories"
      testID="explore-categories"
    >
      <Chip
        label="All"
        icon={LayoutGrid}
        active={value === null}
        onPress={() => onChange(null)}
        testID="category-all"
      />
      {categories.map((c) => (
        <Chip
          key={c.key}
          testID={`category-${c.key}`}
          label={c.label}
          icon={categoryIcon(c.key)}
          active={value === c.key}
          onPress={() => onChange(value === c.key ? null : c.key)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : pressed ? colors.muted : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Icon icon={icon} size={16} color={active ? "primaryForeground" : "mutedForeground"} />
      <Text variant="callout" weight="medium" tone={active ? "primaryForeground" : "muted"}>
        {label}
      </Text>
    </Pressable>
  );
}

const AVAILABILITY: { value: ExploreAvailability; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

/** The filters button (with how many are set) and its sheet: free times, price, deals, distance. Applied together. */
export function FiltersButton({
  filters,
  activeCount,
  onApply,
  onClear,
}: {
  filters: ExploreFilters;
  activeCount: number;
  onApply: (patch: Partial<ExploreFilters>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        testID="explore-filters"
        variant={activeCount > 0 ? "brand" : "ghost"}
        size="sm"
        icon={SlidersHorizontal}
        label={activeCount > 0 ? `Filters · ${activeCount}` : "Filters"}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <FiltersSheet
          filters={filters}
          onClose={() => setOpen(false)}
          onApply={(patch) => {
            setOpen(false);
            onApply(patch);
          }}
          onClear={() => {
            setOpen(false);
            onClear();
          }}
        />
      ) : null}
    </>
  );
}

function FiltersSheet({
  filters,
  onClose,
  onApply,
  onClear,
}: {
  filters: ExploreFilters;
  onClose: () => void;
  onApply: (patch: Partial<ExploreFilters>) => void;
  onClear: () => void;
}) {
  const [available, setAvailable] = useState(filters.available);
  const [min, setMin] = useState(euroText(filters.minPrice));
  const [max, setMax] = useState(euroText(filters.maxPrice));
  const [deals, setDeals] = useState(filters.deals);
  const radius = effectiveRadiusKm(filters);
  const [radiusKm, setRadiusKm] = useState(radius);
  const minCents = parseEuro(min);
  const maxCents = parseEuro(max);
  const minError = minCents === undefined ? "Enter an amount in euro, like 25 or 12.50" : null;
  const maxError =
    maxCents === undefined
      ? "Enter an amount in euro, like 25 or 12.50"
      : maxCents !== null && typeof minCents === "number" && maxCents < minCents
        ? "Must be at least the min"
        : null;
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Filters"
      testID="filters-sheet"
      footer={
        <View style={styles.footer}>
          <Button
            testID="filters-apply"
            variant="primary"
            size="lg"
            fullWidth
            label="Show results"
            disabled={!!minError || !!maxError}
            onPress={() =>
              onApply({
                available,
                minPrice: minCents ?? null,
                maxPrice: maxCents ?? null,
                deals,
                ...(radius !== null && radiusKm !== radius ? { radiusKm } : {}),
              })
            }
          />
          <Button variant="ghost" fullWidth label="Clear filters" onPress={onClear} />
        </View>
      }
    >
      <View style={styles.field}>
        <Text variant="callout" weight="medium">
          Free times
        </Text>
        <SegmentedControl
          accessibilityLabel="Free times"
          segments={AVAILABILITY}
          value={available}
          onChange={setAvailable}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            testID="filters-min"
            label="Min price (€)"
            value={min}
            onChangeText={setMin}
            keyboardType="decimal-pad"
            placeholder="Any"
            error={minError}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            testID="filters-max"
            label="Max price (€)"
            value={max}
            onChangeText={setMax}
            keyboardType="decimal-pad"
            placeholder="Any"
            error={maxError}
          />
        </View>
      </View>
      <Switch
        testID="filters-deals"
        label="Has deals"
        description="Off-peak and last-minute discounts."
        value={deals}
        onValueChange={setDeals}
      />
      {radius !== null ? (
        <Select
          label="Distance"
          value={String(radiusKm ?? radius)}
          options={radiusOptions(filters.location).map((km) => ({
            value: String(km),
            label: `Within ${km} km`,
          }))}
          onChange={(v) => setRadiusKm(Number(v))}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  location: { gap: space[2] },
  row: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  flex: { flex: 1 },
  chips: { flexDirection: "row", gap: space[2], paddingVertical: space[0.5] },
  chip: {
    minHeight: MIN_TOUCH - space[1],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: borderWidth.hairline,
  },
  field: { gap: space[1.5] },
  footer: { gap: space[1] },
});
