"use client";

import Link from "next/link";
import {
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Columns3,
  List,
} from "lucide-react";
import type { Resource } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { ResourceChoice } from "@/lib/dashboard/calendar-resources";
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
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { useFmt } from "../common";
import { CalendarResourcePicker } from "./calendar-resource-picker";

type Setter = (patch: UrlParamsPatch) => void;

/**
 * Above the grid: the date (a month picker), previous / next / today, view and "New"; then what's showing, anything
 * waiting on the business, cancelled bookings and the full list. Phones show glyphs, so the grid keeps the screen.
 */
export function CalendarToolbar({
  date,
  view,
  today,
  range,
  resources,
  resourcesLoading,
  choice,
  shown,
  position,
  waiting,
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
  choice: ResourceChoice;
  /** The resources showing now. */
  shown: Resource[];
  /** Which columns are on screen, when they don't all fit: "1–4 of 6". */
  position: string | null;
  /** Bookings on show that are waiting for approval. */
  waiting: number;
  showCancelled: boolean;
  setParams: Setter;
  go: (delta: number) => void;
  onNew: () => void;
}) {
  const { v } = useVocabulary();
  const business = useCurrentBusiness();
  const phone = useMediaQuery("(max-width: 639px)");
  const viewControl = (
    <SegmentedControl
      size="sm"
      aria-label="Calendar view"
      collapseLabels="sm"
      value={view}
      onValueChange={(val) => setParams({ view: val === "day" ? null : val })}
      options={[
        { value: "day", label: "Day", icon: <Columns3 aria-hidden />, shortcut: "D" },
        { value: "week", label: "Week", icon: <CalendarRange aria-hidden />, shortcut: "W" },
      ]}
    />
  );
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-2.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <div className="min-w-0 max-sm:mr-auto">
          <DatePopover date={date} view={view} today={today} range={range} setParams={setParams} />
        </div>
        <div className="flex items-center">
          <IconButton
            label={view === "day" ? "Previous day" : "Previous week"}
            shortcut="←"
            onClick={() => go(-1)}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton label={view === "day" ? "Next day" : "Next week"} shortcut="→" onClick={() => go(1)}>
            <ChevronRight />
          </IconButton>
        </div>
        <Tooltip content="Today" shortcut="T">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setParams({ date: null })}
            disabled={date === today && view === "day"}
            // Phones: a glyph (the date row is tight); still named "Today".
            className="max-sm:aspect-square max-sm:px-0"
          >
            <CalendarCheck aria-hidden className="sm:hidden" />
            <span className="max-sm:sr-only">Today</span>
          </Button>
        </Tooltip>
        <div className="flex-1 max-sm:hidden" />
        {!phone && viewControl}
        <ActionButton
          variant="primary"
          size="sm"
          onClick={onNew}
          icon={<CalendarPlus />}
          label={`New ${v("booking")}`}
          shortcut="N"
        />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {resourcesLoading && (
          <Skeleton className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none pointer-coarse:h-11" />
        )}
        {resources.length > 1 && (
          <CalendarResourcePicker
            businessId={business.id}
            resources={resources}
            choice={choice}
            shown={shown}
            onChoose={(param) => setParams({ resource: param })}
          />
        )}
        {position && (
          <span className="tnum text-sm whitespace-nowrap text-muted-foreground max-sm:hidden">
            {position}
          </span>
        )}
        {waiting > 0 && (
          <Link
            href={`${dashboardHref(business.slug, "bookings")}?status=pending_approval`}
            className="inline-flex h-8 shrink-0 items-center rounded-md bg-warning-soft px-2.5 text-sm font-medium whitespace-nowrap text-warning-soft-foreground transition-colors hover:bg-warning-soft/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:hidden"
          >
            {waiting} waiting for approval
          </Link>
        )}
        <div className="flex-1 max-sm:hidden" />
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
        {phone && viewControl}
        {/* Phones have the list in the tab bar. */}
        <Button asChild variant="secondary" size="sm" className="max-sm:hidden">
          <Link href={dashboardHref(business.slug, "bookings")}>
            <List aria-hidden /> All {v("bookings")}
          </Link>
        </Button>
      </div>
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
  range: { from, to },
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-ml-1.5 min-w-0 rounded-md px-1.5 py-0.5 text-left text-lg font-semibold tracking-tight whitespace-nowrap transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-[1.375rem] sm:leading-8 pointer-coarse:min-h-11"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="hidden sm:inline">{title}</span>
            <span className="sm:hidden">{shortTitle}</span>
            <ChevronDown aria-hidden className="size-4 text-subtle-foreground" />
          </span>
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
