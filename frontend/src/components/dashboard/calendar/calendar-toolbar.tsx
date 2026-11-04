"use client";

import {
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Columns3,
} from "lucide-react";
import type { Resource } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { PlainDate } from "@/lib/format/datetime";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { ColorDot, useFmt } from "../common";

type Setter = (patch: UrlParamsPatch) => void;

/**
 * Above the grid: the date (a month picker), today / previous / next; then filters, view and "New". On phones it is
 * two rows of glyphs (Day/Week, cancelled and New collapse to named icons) so the grid keeps the screen.
 */
export function CalendarToolbar({
  date,
  view,
  today,
  range,
  resources,
  resourcesLoading,
  selected,
  showCancelled,
  setParams,
  go,
  onNew,
}: {
  date: PlainDate;
  view: CalendarMode;
  today: PlainDate;
  range: { days: PlainDate[]; from: PlainDate; to: PlainDate };
  resources: Resource[];
  /** Holds the filter's place until the resources arrive, so the toolbar doesn't shift when it appears. */
  resourcesLoading: boolean;
  selected: Resource | undefined;
  showCancelled: boolean;
  setParams: Setter;
  go: (delta: number) => void;
  onNew: () => void;
}) {
  const { v } = useVocabulary();
  const phone = useMediaQuery("(max-width: 639px)");
  return (
    // One wrapping row: the date row with "New" at its end, the filters under both; from `xl` it is all one row.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3 pb-4 xl:flex-nowrap">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Tooltip content="Today" shortcut="T">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setParams({ date: null })}
            disabled={date === today && view === "day"}
            // Phones: a glyph (the date row is tight); still named "Today".
            className="max-sm:order-3 max-sm:aspect-square max-sm:px-0"
          >
            <CalendarCheck aria-hidden className="sm:hidden" />
            <span className="max-sm:sr-only">Today</span>
          </Button>
        </Tooltip>
        <div className="flex items-center max-sm:order-2">
          <IconButton label={view === "day" ? "Previous day" : "Previous week"} onClick={() => go(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label={view === "day" ? "Next day" : "Next week"} onClick={() => go(1)}>
            <ChevronRight />
          </IconButton>
        </div>
        <div className="min-w-0 max-sm:order-1 max-sm:mr-auto">
          <DatePopover date={date} view={view} today={today} range={range} setParams={setParams} />
        </div>
      </div>
      <div className="order-3 flex min-w-0 basis-full items-center gap-2 sm:flex-wrap xl:order-2 xl:basis-auto">
        {resourcesLoading && (
          <Skeleton className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none pointer-coarse:h-11" />
        )}
        {resources.length > 1 && (
          <Select
            value={selected ? selected.id : "all"}
            onValueChange={(val) => setParams({ resource: val === "all" ? null : val })}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 sm:w-auto sm:min-w-40 sm:flex-none"
              aria-label={`Filter by ${v("resource")}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All {v("resources")}</SelectItem>
              <SelectSeparator />
              {resources.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <ColorDot color={r.color} /> {r.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {phone ? (
          <CancelledToggle
            checked={showCancelled}
            onChange={(c) => setParams({ cancelled: c ? "1" : null })}
          />
        ) : (
          <label className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground pointer-coarse:h-11">
            <Switch
              size="sm"
              checked={showCancelled}
              onCheckedChange={(c) => setParams({ cancelled: c ? "1" : null })}
            />
            Cancelled
          </label>
        )}
        <SegmentedControl
          size="sm"
          aria-label="Calendar view"
          collapseLabels="sm"
          value={view}
          onValueChange={(val) => setParams({ view: val === "day" ? null : val })}
          options={[
            { value: "day", label: "Day", icon: <Columns3 aria-hidden /> },
            { value: "week", label: "Week", icon: <CalendarRange aria-hidden /> },
          ]}
        />
      </div>
      <ActionButton
        variant="primary"
        size="sm"
        onClick={onNew}
        icon={<CalendarPlus />}
        label={`New ${v("booking")}`}
        className="order-2 xl:order-3"
      />
    </div>
  );
}

/** Phones: "show cancelled" as a named glyph switch (the labelled switch doesn't fit next to the filters). */
function CancelledToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Tooltip content="Show cancelled">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Cancelled"
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11 [&_svg]:size-4.5",
          checked
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-surface text-muted-foreground",
        )}
      >
        <CircleSlash aria-hidden />
      </button>
    </Tooltip>
  );
}

/** The current day or week as a title; opens a month calendar to jump to a date. */
function DatePopover({
  date,
  view,
  today,
  range: { days, from, to },
  setParams,
}: {
  date: PlainDate;
  view: CalendarMode;
  today: PlainDate;
  range: { days: PlainDate[]; from: PlainDate; to: PlainDate };
  setParams: Setter;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const title =
    view === "day" ? fmt.date(date, "long") : `${fmt.date(from, "short")} – ${fmt.date(to, "medium")}`;
  const shortTitle =
    view === "day" ? fmt.date(date, "dayMonth") : `${fmt.date(from, "short")} – ${fmt.date(to, "short")}`;
  const showToday = !(days.includes(today) && view === "week") && date === today;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="min-w-0 rounded-md px-1.5 py-1 text-left text-base font-semibold tracking-tight whitespace-nowrap transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-lg pointer-coarse:min-h-11"
        >
          <span className="hidden sm:inline">{title}</span>
          <span className="sm:hidden">{shortTitle}</span>
          {showToday ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground max-sm:hidden">Today</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <Calendar
          value={date}
          onValueChange={(d) => setParams({ date: d === today ? null : d })}
          timeZone={business.timezone}
        />
      </PopoverContent>
    </Popover>
  );
}
