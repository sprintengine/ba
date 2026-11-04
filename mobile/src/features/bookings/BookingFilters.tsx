import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarRange, Filter, RotateCcw } from "lucide-react-native";
import type { BookingStatus, Resource, Service } from "@shared/api/types";
import type { BookingFilters } from "@shared/dashboard/booking-filters";
import { BOOKING_RANGE_LABEL, BOOKING_RANGES, type BookingRange } from "@shared/dashboard/date-ranges";
import { BOOKING_STATUS_OPTIONS } from "@shared/status";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Checkbox, Sheet, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { ChipRow, ChoiceRow, MonthGrid } from "./fields";
import { useFmt } from "./fmt";
import { Chip } from "./parts";

export const DEFAULT_FILTERS: BookingFilters = {
  range: "upcoming",
  customFrom: null,
  customTo: null,
  statuses: [],
  resourceId: "all",
  serviceId: "all",
};

type Open = "range" | "status" | "resource" | "service" | null;

/**
 * The bookings list's filters as a row of chips (the website's toolbar): date range, status (with a one-tap "Needs
 * approval"), resource and service; each chip opens a sheet. "Reset" when anything narrows the default view.
 */
export function BookingFilterBar({
  filters,
  onChange,
  resources,
  services,
  filtered,
  onReset,
  today,
}: {
  filters: BookingFilters;
  onChange: (patch: Partial<BookingFilters>) => void;
  resources: Resource[];
  services: Service[];
  filtered: boolean;
  onReset: () => void;
  today: string;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const pendingOnly = filters.statuses.length === 1 && filters.statuses[0] === "pending_approval";
  const resource = resources.find((r) => r.id === filters.resourceId);
  const service = services.find((s) => s.id === filters.serviceId);
  const rangeLabel =
    filters.range === "custom" && (filters.customFrom || filters.customTo)
      ? `${filters.customFrom ? fmt.date(filters.customFrom, "short") : "…"} – ${filters.customTo ? fmt.date(filters.customTo, "short") : "…"}`
      : BOOKING_RANGE_LABEL[filters.range];

  return (
    <>
      <ChipRow accessibilityLabel="Filters">
        <Chip
          testID="filter-range"
          icon={CalendarRange}
          label={rangeLabel}
          selected={filters.range !== "upcoming"}
          accessibilityLabel={`Date range: ${rangeLabel}`}
          onPress={() => setOpen("range")}
        />
        <Chip
          testID="filter-pending"
          role="checkbox"
          label="Needs approval"
          selected={pendingOnly}
          onPress={() => onChange({ statuses: pendingOnly ? [] : ["pending_approval"] })}
        />
        <Chip
          testID="filter-status"
          icon={Filter}
          label="Status"
          count={filters.statuses.length || undefined}
          selected={filters.statuses.length > 0 && !pendingOnly}
          onPress={() => setOpen("status")}
        />
        {resources.length > 1 ? (
          <Chip
            testID="filter-resource"
            label={resource?.name ?? `All ${v("resources")}`}
            selected={!!resource}
            onPress={() => setOpen("resource")}
          />
        ) : null}
        {services.length > 1 ? (
          <Chip
            testID="filter-service"
            label={service?.name ?? "All services"}
            selected={!!service}
            onPress={() => setOpen("service")}
          />
        ) : null}
        {filtered ? <Chip testID="filter-reset" icon={RotateCcw} label="Reset" onPress={onReset} /> : null}
      </ChipRow>

      <Sheet visible={open === "range"} onClose={close} title="Date range" testID="range-sheet">
        <View style={styles.list} accessibilityRole="radiogroup">
          {BOOKING_RANGES.map((r: BookingRange) => (
            <ChoiceRow
              key={r}
              testID={`range-${r}`}
              title={BOOKING_RANGE_LABEL[r]}
              selected={filters.range === r}
              onPress={() => {
                onChange({ range: r, customFrom: null, customTo: null });
                if (r !== "custom") close();
              }}
            />
          ))}
        </View>
        {filters.range === "custom" ? (
          <View style={styles.list}>
            <Text weight="semibold">From</Text>
            <MonthGrid
              value={filters.customFrom}
              today={today}
              max={filters.customTo ?? undefined}
              locale={fmt.locale}
              onChange={(d) => onChange({ customFrom: d })}
            />
            <Text weight="semibold">To</Text>
            <MonthGrid
              value={filters.customTo}
              today={today}
              min={filters.customFrom ?? undefined}
              locale={fmt.locale}
              onChange={(d) => onChange({ customTo: d })}
            />
            <Button label="Done" fullWidth onPress={close} />
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={open === "status"}
        onClose={close}
        title="Status"
        testID="status-sheet"
        footer={<Button label="Done" fullWidth onPress={close} />}
      >
        {BOOKING_STATUS_OPTIONS.map((o) => {
          const checked = filters.statuses.includes(o.value);
          return (
            <Checkbox
              key={o.value}
              testID={`status-${o.value}`}
              label={o.label}
              checked={checked}
              onChange={(c) =>
                onChange({
                  statuses: c
                    ? [...filters.statuses, o.value]
                    : filters.statuses.filter((x: BookingStatus) => x !== o.value),
                })
              }
            />
          );
        })}
        {filters.statuses.length > 0 ? (
          <Button label="Clear" variant="ghost" onPress={() => onChange({ statuses: [] })} />
        ) : null}
      </Sheet>

      <Sheet visible={open === "resource"} onClose={close} title={v("resource", { title: true })}>
        <View style={styles.list} accessibilityRole="radiogroup">
          <ChoiceRow
            title={`All ${v("resources")}`}
            selected={filters.resourceId === "all"}
            onPress={() => {
              onChange({ resourceId: "all" });
              close();
            }}
          />
          {resources.map((r) => (
            <ChoiceRow
              key={r.id}
              title={r.name}
              selected={filters.resourceId === r.id}
              onPress={() => {
                onChange({ resourceId: r.id });
                close();
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet visible={open === "service"} onClose={close} title="Service">
        <View style={styles.list} accessibilityRole="radiogroup">
          <ChoiceRow
            title="All services"
            selected={filters.serviceId === "all"}
            onPress={() => {
              onChange({ serviceId: "all" });
              close();
            }}
          />
          {services.map((s) => (
            <ChoiceRow
              key={s.id}
              title={s.name}
              selected={filters.serviceId === s.id}
              onPress={() => {
                onChange({ serviceId: s.id });
                close();
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({ list: { gap: space[2] } });
