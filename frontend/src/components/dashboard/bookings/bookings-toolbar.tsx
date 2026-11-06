"use client";

import type { Resource, Service } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { BookingFilters } from "@/lib/dashboard/booking-filters";
import { BOOKING_RANGE_LABEL, BOOKING_RANGES } from "@/lib/dashboard/date-ranges";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusFilter } from "./status-filter";

/** Filters as quiet chips: they shouldn't be the darkest lines on a page of bookings. */
const QUIET_FILTER = "w-auto shrink-0 border-transparent bg-muted shadow-none hover:bg-accent";

/** Search box and filters above the bookings list; every change goes to the URL through `setParams`. */
export function BookingsToolbar({
  filters,
  search,
  onSearchChange,
  setParams,
  resources,
  services,
  filtered,
  onReset,
}: {
  filters: BookingFilters;
  search: string;
  onSearchChange: (search: string) => void;
  setParams: (patch: UrlParamsPatch) => void;
  resources: Resource[];
  services: Service[];
  /** Show "Clear filters" (something narrows the default view). */
  filtered: boolean;
  onReset: () => void;
}) {
  const { v } = useVocabulary();
  return (
    <div className="pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          placeholder="Name, email, phone or reference"
          value={search}
          onValueChange={onSearchChange}
          className="sm:w-60"
          aria-label={`Search ${v("bookings")}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter filters={filters} setParams={setParams} />
          <StatusFilter
            value={filters.statuses}
            onChange={(s) => setParams({ status: s.length ? s.join(",") : null })}
          />
          {resources.length > 1 && (
            <Select
              value={filters.resourceId}
              onValueChange={(r) => setParams({ resource: r === "all" ? null : r })}
            >
              <SelectTrigger size="sm" className={QUIET_FILTER} aria-label={`Filter by ${v("resource")}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {v("resources")}</SelectItem>
                <SelectSeparator />
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {services.length > 1 && (
            <Select
              value={filters.serviceId}
              onValueChange={(s) => setParams({ service: s === "all" ? null : s })}
            >
              <SelectTrigger size="sm" className={QUIET_FILTER} aria-label="Filter by service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                <SelectSeparator />
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filtered && (
            <Button size="sm" variant="ghost" onClick={onReset}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Date range preset, plus From/To pickers for a custom range. */
function RangeFilter({
  filters,
  setParams,
}: {
  filters: BookingFilters;
  setParams: (patch: UrlParamsPatch) => void;
}) {
  const business = useCurrentBusiness();
  return (
    <>
      <Select
        value={filters.range}
        onValueChange={(r) => setParams({ range: r === "upcoming" ? null : r, from: null, to: null })}
      >
        <SelectTrigger size="sm" className={QUIET_FILTER} aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOOKING_RANGES.map((r) => (
            <SelectItem key={r} value={r}>
              {BOOKING_RANGE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filters.range === "custom" && (
        <div className="flex items-center gap-2">
          <DatePicker
            size="sm"
            value={filters.customFrom}
            onValueChange={(d) => setParams({ from: d })}
            placeholder="From"
            max={filters.customTo ?? undefined}
            timeZone={business.timezone}
            className="w-40"
          />
          <span className="text-subtle-foreground">–</span>
          <DatePicker
            size="sm"
            value={filters.customTo}
            onValueChange={(d) => setParams({ to: d })}
            placeholder="To"
            min={filters.customFrom ?? undefined}
            timeZone={business.timezone}
            className="w-40"
          />
        </div>
      )}
    </>
  );
}
