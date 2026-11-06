"use client";

import { ListFilter } from "lucide-react";
import type { Resource, Service } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { BookingFilters } from "@/lib/dashboard/booking-filters";
import { BOOKING_RANGE_LABEL, BOOKING_RANGES } from "@/lib/dashboard/date-ranges";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** Search box and the filters above the bookings list; every change goes to the URL through `setParams`. */
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
  const active = activeFilters(filters);
  return (
    <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
      <SearchInput
        placeholder="Search"
        value={search}
        onValueChange={onSearchChange}
        className="min-w-0 flex-1 transition-[width] sm:w-44 sm:flex-none sm:focus-within:w-64"
        title="Name, email, phone or reference"
        aria-label={`Search ${v("bookings")}`}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className={cn("shrink-0", active > 0 && "border-brand-border")}
          >
            <ListFilter /> Filters
            {active > 0 && (
              <Badge tone="brand" className="h-5 px-1.5">
                {active}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-84 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
          <RangeFilter filters={filters} setParams={setParams} />
          <StatusFilter
            value={filters.statuses}
            onChange={(s) => setParams({ status: s.length ? s.join(",") : null })}
          />
          {resources.length > 1 && (
            <FilterField label={v("resources", { title: true })}>
              <Select
                value={filters.resourceId}
                onValueChange={(r) => setParams({ resource: r === "all" ? null : r })}
              >
                <SelectTrigger size="sm" aria-label={`Filter by ${v("resource")}`}>
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
            </FilterField>
          )}
          {services.length > 1 && (
            <FilterField label="Service">
              <Select
                value={filters.serviceId}
                onValueChange={(s) => setParams({ service: s === "all" ? null : s })}
              >
                <SelectTrigger size="sm" aria-label="Filter by service">
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
            </FilterField>
          )}
        </PopoverContent>
      </Popover>
      {filtered && (
        <Button size="sm" variant="ghost" className="shrink-0" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** How many filters narrow the view beyond the tabs' own settings. */
function activeFilters(f: BookingFilters) {
  return (
    Number(!["upcoming", "today", "past30"].includes(f.range)) +
    Number(f.statuses.length > 0 && !(f.statuses.length === 1 && f.statuses[0] === "pending_approval")) +
    Number(f.resourceId !== "all") +
    Number(f.serviceId !== "all")
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
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
    <FilterField label="Dates">
      <Select
        value={filters.range}
        onValueChange={(r) => setParams({ range: r === "upcoming" ? null : r, from: null, to: null })}
      >
        <SelectTrigger size="sm" aria-label="Date range">
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
        <div className="mt-1 flex items-center gap-2">
          <DatePicker
            size="sm"
            value={filters.customFrom}
            onValueChange={(d) => setParams({ from: d })}
            placeholder="From"
            max={filters.customTo ?? undefined}
            timeZone={business.timezone}
            className="min-w-0 flex-1"
          />
          <span className="text-subtle-foreground">–</span>
          <DatePicker
            size="sm"
            value={filters.customTo}
            onValueChange={(d) => setParams({ to: d })}
            placeholder="To"
            min={filters.customFrom ?? undefined}
            timeZone={business.timezone}
            className="min-w-0 flex-1"
          />
        </div>
      )}
    </FilterField>
  );
}
