"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Clock, LockOpen, Pause, Pencil, Plus, Trash2, Undo2, Zap } from "lucide-react";
import type { CustomerGroup, ReleaseSchedule, Service } from "@/lib/api/types";
import {
  useCustomerGroups,
  useDeleteReleaseSchedule,
  useReleases,
  useReleaseSchedules,
  useServices,
} from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { addDaysToPlainDate, formatDate, todayInTz } from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { useNow } from "@/lib/hooks/use-now";
import { sameRelease } from "@/lib/releases/calendar";
import {
  liveDay,
  opensLabel,
  RELEASE_STATE,
  scheduleSummary,
  servicesLabel,
  whoLabel,
} from "@/lib/releases/text";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { withToast } from "@/components/common/with-toast";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChangeTimePopover,
  changeNote,
  useReleaseControls,
  type ReleaseTarget,
} from "../releases/release-controls";
import { ReleaseScheduleEditor } from "../releases/release-schedule-editor";
import { SettingsHeader } from "./settings-common";

/** Days of releases the page lists ahead. */
const UPCOMING_DAYS = 14;
/** Releases listed at most. */
const UPCOMING_ROWS = 8;

/** Settings → Release schedules (§21): the schedules, and the next releases with one-off changes. */
export function ReleaseSettings() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const schedules = useReleaseSchedules(business.id);
  const services = useServices(business.id);
  const groups = useCustomerGroups(business.id);
  const editor = useEditorDialog<ReleaseSchedule>();
  const bookable = (services.data ?? []).filter((s) => s.isActive && s.isPublic);
  const list = schedules.data ?? [];

  return (
    <>
      <SettingsHeader
        segment="release-schedules"
        actions={
          // With no schedules yet, the empty state below carries this action.
          list.length > 0 && (
            <ActionButton
              size="sm"
              variant="primary"
              onClick={() => editor.open(null)}
              icon={<Plus />}
              label="New schedule"
              disabled={bookable.length === 0}
            />
          )
        }
      />
      <p className="mb-6 max-w-prose text-sm text-muted-foreground">
        A schedule keeps each day closed to online booking until it opens: the day before at 17:00, say. Your
        team can always book any free time, and {v("customers")} see when a closed day opens.
      </p>
      {schedules.isError ? (
        <ErrorState error={schedules.error} onRetry={() => schedules.refetch()} />
      ) : schedules.isPending || services.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState
            icon={<CalendarClock />}
            title="No release schedules"
            description={`Every day can be booked as far ahead as your policies allow. Add a schedule to open days at a set time.`}
            action={
              bookable.length > 0 ? (
                <Button size="sm" variant="primary" onClick={() => editor.open(null)}>
                  <Plus /> New schedule
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            {list.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                services={services.data ?? []}
                groups={groups.data ?? []}
                onEdit={() => editor.open(s)}
              />
            ))}
            <UncoveredNote schedules={list} services={bookable} />
          </div>
          <UpcomingReleases schedules={list.filter((s) => s.status === "active")} />
        </div>
      )}
      {editor.current && (
        <ReleaseScheduleEditor
          key={editor.current.key}
          schedule={editor.current.item}
          services={bookable}
          groups={(groups.data ?? []).filter((g) => g.isActive)}
          {...editor.dialogProps}
        />
      )}
    </>
  );
}

function ScheduleCard({
  schedule,
  services,
  groups,
  onEdit,
}: {
  schedule: ReleaseSchedule;
  services: Service[];
  groups: CustomerGroup[];
  onEdit: () => void;
}) {
  const business = useCurrentBusiness();
  const remove = useDeleteReleaseSchedule(business.id);
  const paused = schedule.status === "paused";
  return (
    <Card className={paused ? "opacity-75" : undefined}>
      <CardContent className="flex items-start gap-4 py-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
          <CalendarClock className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold tracking-tight">{schedule.name}</p>
            <Badge tone={paused ? "neutral" : "success"} dot className="h-5">
              {paused ? "Paused" : "Active"}
            </Badge>
          </div>
          <p className="text-sm">{scheduleSummary(schedule, business.locale || DEFAULT_LOCALE)}</p>
          <p className="text-xs text-muted-foreground">
            {servicesLabel(schedule.serviceIds, services)} · {whoLabel(schedule, groups)}
          </p>
        </div>
        <IconButton label={`Edit ${schedule.name}`} onClick={onEdit}>
          <Pencil />
        </IconButton>
        <ConfirmDialog
          trigger={
            <IconButton label={`Delete ${schedule.name}`}>
              <Trash2 />
            </IconButton>
          }
          title={`Delete ${schedule.name}?`}
          description="Its days open to online booking straight away, as far ahead as your policies allow."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await withToast(() => remove.mutateAsync(schedule.id), "Schedule deleted");
          }}
        />
      </CardContent>
    </Card>
  );
}

/** The bookable services no schedule covers: they open as far ahead as the policies allow, as without schedules. */
function UncoveredNote({ schedules, services }: { schedules: ReleaseSchedule[]; services: Service[] }) {
  const covered = new Set(schedules.filter((s) => s.status === "active").flatMap((s) => s.serviceIds));
  const uncovered = services.filter((s) => !covered.has(s.id));
  if (uncovered.length === 0) return null;
  const names = uncovered.map((s) => s.name);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-surface-sunken/50 px-4 py-3 text-sm text-muted-foreground">
      <LockOpen className="mt-0.5 size-4 shrink-0" />
      <p>
        {list} {names.length === 1 ? "isn't" : "aren't"} in an active schedule: they can be booked as far
        ahead as your policies allow.
      </p>
    </div>
  );
}

function UpcomingReleases({ schedules }: { schedules: ReleaseSchedule[] }) {
  const business = useCurrentBusiness();
  const today = todayInTz(business.timezone);
  const range = useMemo(() => ({ from: today, to: addDaysToPlainDate(today, UPCOMING_DAYS - 1) }), [today]);
  const releases = useReleases(business.id, schedules.length > 0 ? range : null);
  const [chosen, setChosen] = useState<string | null>(null);
  const now = useNow(30_000);
  if (schedules.length === 0) return null;
  const scheduleId = chosen && schedules.some((s) => s.id === chosen) ? chosen : (schedules[0]?.id ?? "");
  const schedule = schedules.find((s) => s.id === scheduleId);
  const days = (releases.data?.schedules.find((r) => r.scheduleId === scheduleId)?.days ?? []).map((d) =>
    liveDay(d, now),
  );
  // What's still to come, and anything changed by hand; days with nothing to open are left out.
  const rows = days
    .filter((d) => (d.state !== "open" || d.changed) && (d.times > 0 || d.changed))
    .slice(0, UPCOMING_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming releases</CardTitle>
        <CardDescription>
          Change one release without changing its schedule, like one meeting in a recurring series.
        </CardDescription>
        {schedules.length > 1 && (
          <SegmentedControl
            aria-label="Schedule"
            size="sm"
            className="mt-3 self-start"
            value={scheduleId}
            onValueChange={setChosen}
            options={schedules.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col p-0">
        {releases.isError ? (
          <div className="px-6 pb-6">
            <ErrorState error={releases.error} onRetry={() => releases.refetch()} />
          </div>
        ) : releases.isPending ? (
          <div className="px-6 pb-6">
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Nothing to release in the next {UPCOMING_DAYS} days: every day with free times is already open.
          </p>
        ) : (
          <ul aria-label="Upcoming releases">
            {rows.map((day) => (
              <UpcomingRow
                key={day.date}
                target={{
                  scheduleId,
                  scheduleName: schedule?.name ?? "",
                  day,
                  multiDay: schedule ? sameRelease(schedule, day.date).length > 1 : false,
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingRow({ target }: { target: ReleaseTarget }) {
  const business = useCurrentBusiness();
  const locale = business.locale || DEFAULT_LOCALE;
  const now = useNow();
  const controls = useReleaseControls(target);
  const { day } = target;
  const state = RELEASE_STATE[day.state];
  const note = changeNote(day, opensLabel(day.scheduledAt, business.timezone, locale, now));
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle px-6 py-3 first:border-t-0">
      <div className="w-28 shrink-0">
        <p className="text-sm font-medium">{formatDate(day.date, business.timezone, "dayMonth", locale)}</p>
        <p className="tnum text-xs text-muted-foreground">
          {day.times} {day.times === 1 ? "time" : "times"}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm">
          {day.state === "held" ? (
            <Pause className="size-3.5 shrink-0 text-danger" />
          ) : (
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {day.opensAt === null
            ? "Opens when you open it"
            : `${day.state === "open" ? "Opened" : "Opens"} ${opensLabel(day.opensAt, business.timezone, locale, now)}`}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <Badge tone={state.tone} dot className="h-5">
        {state.label}
      </Badge>
      <div className="flex shrink-0 items-center gap-1">
        {day.state !== "open" && (
          <Button
            size="xs"
            variant="ghost"
            disabled={controls.pending}
            onClick={() => void controls.openNow()}
          >
            <Zap /> Open now
          </Button>
        )}
        {day.state !== "open" && <ChangeTimePopover target={target} />}
        {day.changed ? (
          <Button size="xs" variant="ghost" disabled={controls.pending} onClick={() => void controls.reset()}>
            <Undo2 /> Reset
          </Button>
        ) : (
          <Button size="xs" variant="ghost" disabled={controls.pending} onClick={() => void controls.hold()}>
            <Pause /> Hold
          </Button>
        )}
      </div>
    </li>
  );
}
