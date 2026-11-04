"use client";

import { useId } from "react";
import { CircleAlert, LocateFixed, MapPin, X } from "lucide-react";
import type { MarketplaceCity } from "@/lib/api/types";
import { formatListingCount, type ExploreLocation } from "@/lib/explore";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import type { GeolocationState } from "./use-geolocation";

const ANYWHERE = "__anywhere";

/** City picker (with listing counts) + "Near me". A geolocation failure never blocks the city picker. */
export function LocationPicker({
  cities,
  location,
  onCityChange,
  onNearMe,
  geolocation,
  onDismissError,
}: {
  cities: MarketplaceCity[] | undefined;
  location: ExploreLocation;
  onCityChange: (slug: string | null) => void;
  onNearMe: () => void;
  geolocation: GeolocationState;
  onDismissError: () => void;
}) {
  const id = useId();
  const options: ComboboxOption[] = [
    { value: ANYWHERE, label: "All of Ireland", icon: <MapPin className="size-4 text-subtle-foreground" /> },
    ...(cities ?? []).map((c) => ({
      value: c.slug,
      label: c.name,
      hint: formatListingCount(c.listingCount),
    })),
  ];
  const value = location.kind === "city" ? location.slug : location.kind === "anywhere" ? ANYWHERE : null;
  const near = location.kind === "near";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Label htmlFor={id} className="sr-only">
          City
        </Label>
        <Combobox
          id={id}
          options={options}
          value={value}
          onValueChange={(v) => onCityChange(v === ANYWHERE ? null : v)}
          placeholder={near ? "Near you" : "Choose a city"}
          searchPlaceholder="Search cities…"
          emptyText="No city by that name yet."
          disabled={!cities}
          className="min-w-0 flex-1 md:w-56 md:flex-none pointer-coarse:h-11"
        />
        <Button
          variant={near ? "soft" : "secondary"}
          aria-pressed={near}
          loading={geolocation.status === "locating"}
          onClick={onNearMe}
        >
          <LocateFixed /> Near me
        </Button>
      </div>
      {geolocation.status === "error" && (
        <div
          role="alert"
          className="flex animate-fade-in items-start gap-2 rounded-lg border border-warning-border bg-warning-soft py-2 pr-1.5 pl-3 text-sm text-warning-soft-foreground"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{geolocation.message}</p>
          <IconButton
            label="Dismiss"
            tooltip={false}
            size="xs"
            className="pointer-coarse:size-11"
            onClick={onDismissError}
          >
            <X />
          </IconButton>
        </div>
      )}
    </div>
  );
}
