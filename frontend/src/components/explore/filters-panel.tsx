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

/** Availability, price, deals and (with a location) radius. Used in the desktop sidebar and the mobile drawer. */
export function FiltersPanel({
  filters,
  onChange,
}: {
  filters: ExploreFilters;
  onChange: (patch: Partial<ExploreFilters>) => void;
}) {
  const radius = effectiveRadiusKm(filters);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p aria-hidden className="text-sm leading-5 font-medium">
          Free times
        </p>
        <SegmentedControl
          aria-label="Free times"
          value={filters.available}
          onValueChange={(available) => onChange({ available })}
          options={AVAILABILITY}
          className="w-full [&>*]:flex-1"
        />
      </div>

      <PriceRange
        min={filters.minPrice}
        max={filters.maxPrice}
        currency={EXPLORE_CURRENCY}
        onChange={({ min, max }) => onChange({ minPrice: min, maxPrice: max })}
      />

      <Field label="Has deals" help="Off-peak and last-minute discounts." orientation="horizontal">
        <Switch checked={filters.deals} onCheckedChange={(deals) => onChange({ deals })} />
      </Field>

      {radius !== null && (
        <Field label="Distance">
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
