"use client";

import {
  effectiveRadiusKm,
  radiusOptions,
  type ExploreAvailability,
  type ExploreFilters,
} from "@/lib/explore";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PriceRange } from "./price-range";

const AVAILABILITY: { value: ExploreAvailability; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

/** Marketplace prices are in euro. */
export const EXPLORE_CURRENCY = "EUR";

/** Availability, price, deals and (with a location) radius: one row above the results, or stacked in the phone's drawer. */
export function FiltersPanel({
  filters,
  onChange,
  bar = false,
}: {
  filters: ExploreFilters;
  onChange: (patch: Partial<ExploreFilters>) => void;
  bar?: boolean;
}) {
  const radius = effectiveRadiusKm(filters);
  return (
    <div className={bar ? "flex flex-wrap items-start gap-x-6 gap-y-3" : "flex flex-col gap-6"}>
      <div className="flex flex-col gap-1.5">
        <p aria-hidden className="text-sm leading-5 font-medium">
          Free times
        </p>
        <SegmentedControl
          aria-label="Free times"
          value={filters.available}
          onValueChange={(available) => onChange({ available })}
          options={AVAILABILITY}
          className={bar ? undefined : "w-full [&>*]:flex-1"}
        />
      </div>

      <div className={bar ? "w-56" : undefined}>
        <PriceRange
          min={filters.minPrice}
          max={filters.maxPrice}
          currency={EXPLORE_CURRENCY}
          onChange={({ min, max }) => onChange({ minPrice: min, maxPrice: max })}
        />
      </div>

      <Field
        label="Has deals"
        help={bar ? undefined : "Off-peak and last-minute discounts."}
        orientation={bar ? "vertical" : "horizontal"}
      >
        <Switch checked={filters.deals} onCheckedChange={(deals) => onChange({ deals })} />
      </Field>

      {radius !== null && (
        <Field label="Distance" className={bar ? "w-40" : undefined}>
          <Select value={String(radius)} onValueChange={(v) => onChange({ radiusKm: Number(v) })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {radiusOptions(filters.location).map((km) => (
                <SelectItem key={km} value={String(km)}>
                  Within {km} km
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}
