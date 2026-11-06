"use client";

import { useRouter } from "next/navigation";
import { AppLink } from "@/components/ui/app-link";
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { Resource } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { ResourceChoice } from "@/lib/dashboard/calendar-resources";
import type { PlainDate } from "@/lib/format/datetime";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
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
import { CALENDAR_ZOOMS, type CalendarZoom } from "./grid-scale";

type Setter = (patch: UrlParamsPatch) => void;

/**
 * Above the grid: the date (a month picker), previous / next / today, Day, Week or List, and "New"; then what's showing,
 * anything waiting on the business and cancelled bookings. Phones show glyphs, so the grid keeps the screen.
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
  zoom,
  onZoom,
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
  zoom: CalendarZoom;
  onZoom: (zoom: CalendarZoom) => void;
  setParams: Setter;
  go: (delta: number) => void;
  onNew: () => void;
}) {
  const { v } = useVocabulary();
  const business = useCurrentBusiness();
  const phone = useMediaQuery("(max-width: 639px)");
  const router = useRouter();
  const viewControl = (
    <SegmentedControl
      size="sm"
      aria-label="Calendar view"
      value={view}
      onValueChange={(val) =>
        val === "list"
          ? router.push(dashboardHref(business.slug, "bookings"))
          : setParams({ view: val === "day" ? null : val })
      }
      options={[
        {
          value: "day",
          label: "Day",
          icon: <Columns3 aria-hidden className="max-xl:hidden @max-[60rem]/tools:hidden" />,
          shortcut: "D",
        },
        {
          value: "week",
          label: "Week",
          icon: <CalendarRange aria-hidden className="max-xl:hidden @max-[60rem]/tools:hidden" />,
          shortcut: "W",
        },
        // Phones have the list in the tab bar.
        ...(phone
          ? []
          : [
              {
                value: "list",
                label: "List",
                icon: <List aria-hidden className="max-xl:hidden @max-[60rem]/tools:hidden" />,
                shortcut: "L",
              },
            ]),
      ]}
    />
  );
  const cancelledToggle = (
    <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-md text-sm text-muted-foreground sm:gap-2 sm:px-2 pointer-coarse:h-11">
      <Switch
        size="sm"
        checked={showCancelled}
        onCheckedChange={(c) => setParams({ cancelled: c ? "1" : null })}
      />
      Cancelled
    </label>
  );
  const viewOptions = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="View options">
          <SlidersHorizontal aria-hidden />
          <span className="max-xl:hidden @max-[60rem]/tools:hidden">View</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-2">
        <ZoomChoice zoom={zoom} onZoom={onZoom} />
        <div className="my-1 border-t border-border" />
        {cancelledToggle}
      </PopoverContent>
    </Popover>
  );
  const picker = resourcesLoading ? (
    <Skeleton className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none pointer-coarse:h-11" />
  ) : resources.length > 1 ? (
    <CalendarResourcePicker
      businessId={business.id}
      resources={resources}
      choice={choice}
      shown={shown}
      onChoose={(param) => setParams({ resource: param })}
    />
  ) : null;
  return (
    // A container, because the inspector takes the room: over the page in a small window, beside it in a big one.
    <div className="@container/tools flex flex-col gap-2 px-4 pt-3 pb-2.5 sm:px-5 max-xl:sm:pr-[max(1.25rem,calc(var(--inspector-width,0px)+0.75rem))]">
      {/* One line from a small window up: the height belongs to the grid. */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <div className="shrink-0 max-sm:mr-auto">
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
            className="@max-[40rem]/tools:hidden"
          >
            Today
          </Button>
        </Tooltip>
        {!phone && (
          <div className="flex w-36 min-w-34 shrink-0 xl:w-52 @max-[62rem]/tools:w-36 @max-[46rem]/tools:hidden">
            {picker}
          </div>
        )}
        {position && (
          <span className="tnum text-sm whitespace-nowrap text-muted-foreground max-lg:hidden @max-[52rem]/tools:hidden">
            {position}
          </span>
        )}
        {waiting > 0 && (
          <AppLink
            href={`${dashboardHref(business.slug, "bookings")}?status=pending_approval`}
            aria-label={`${waiting} ${waiting === 1 ? "needs" : "need"} you`}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-warning-soft px-2.5 text-sm font-medium whitespace-nowrap text-warning-soft-foreground transition-colors hover:bg-warning-soft/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:hidden @max-[47rem]/tools:hidden"
          >
            <span className="tnum">{waiting}</span>
            <span>{waiting === 1 ? "needs" : "need"} you</span>
          </AppLink>
        )}
        <div className="flex-1 max-sm:hidden" />
        {!phone && viewControl}
        {!phone && <div className="@max-[34rem]/tools:hidden">{viewOptions}</div>}
        <ActionButton
          variant="primary"
          size="sm"
          onClick={onNew}
          icon={<Plus />}
          label={`New ${v("booking")}`}
          shortcut="N"
        />
      </div>
      {/* Phones have the list in the tab bar. */}
      {phone && (
        <div className="flex min-w-0 items-center gap-2">
          {picker}
          {viewOptions}
          {viewControl}
        </div>
      )}
    </div>
  );
}

/** How tall an hour is drawn. Every choice stays to scale. */
function ZoomChoice({ zoom, onZoom }: { zoom: CalendarZoom; onZoom: (zoom: CalendarZoom) => void }) {
  return (
    <div role="radiogroup" aria-label="Calendar zoom" className="flex flex-col">
      {CALENDAR_ZOOMS.map((z) => (
        <button
          key={z.value}
          type="button"
          role="radio"
          aria-checked={zoom === z.value}
          onClick={() => onZoom(z.value)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-5 font-medium">{z.label}</span>
            <span className="block text-xs leading-4 text-muted-foreground">{z.hint}</span>
          </span>
          {zoom === z.value && <Check aria-hidden className="size-4 shrink-0" />}
        </button>
      ))}
    </div>
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
            <span className="hidden @[62rem]/tools:inline">{title}</span>
            <span className="@[62rem]/tools:hidden">{shortTitle}</span>
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
