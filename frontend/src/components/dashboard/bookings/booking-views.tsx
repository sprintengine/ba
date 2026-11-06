"use client";

import type { BookingFilters } from "@/lib/dashboard/booking-filters";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { cn } from "@/lib/utils";

type View = { key: string; label: string; patch: UrlParamsPatch };

const VIEWS: View[] = [
  { key: "upcoming", label: "Upcoming", patch: { range: null, status: null, from: null, to: null } },
  {
    key: "needs",
    label: "Needs you",
    patch: { range: null, status: "pending_approval", from: null, to: null },
  },
  { key: "today", label: "Today", patch: { range: "today", status: null, from: null, to: null } },
  { key: "past", label: "Past", patch: { range: "past30", status: null, from: null, to: null } },
];

/** Which view the filters amount to, if any: picking a filter by hand can leave them all unlit. */
function current(filters: BookingFilters) {
  if (filters.statuses.length === 1 && filters.statuses[0] === "pending_approval") {
    return filters.range === "upcoming" ? "needs" : null;
  }
  if (filters.statuses.length > 0) return null;
  if (filters.range === "upcoming") return "upcoming";
  if (filters.range === "today") return "today";
  return filters.range === "past30" ? "past" : null;
}

/** The questions an owner comes here with, as one row of tabs. They only set the filters below, in the URL. */
export function BookingViews({
  filters,
  needsYou,
  setParams,
}: {
  filters: BookingFilters;
  needsYou: number;
  setParams: (patch: UrlParamsPatch) => void;
}) {
  const active = current(filters);
  return (
    <div role="group" aria-label="Views" className="mb-3 flex flex-wrap gap-1">
      {VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          aria-pressed={active === view.key}
          onClick={() => setParams(view.patch)}
          className={cn(
            "focus-ring flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:h-11",
            active === view.key && "bg-muted text-foreground",
          )}
        >
          {view.label}
          {view.key === "needs" && needsYou > 0 && (
            <span className="tnum rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning-soft-foreground">
              {needsYou}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
