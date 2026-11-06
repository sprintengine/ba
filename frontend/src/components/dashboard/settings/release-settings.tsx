"use client";

import { useMemo, useState } from "react";
import { Clock, LockOpen, Pause, Pencil, Plus, Trash2, Undo2, Zap } from "lucide-react";
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
import { ErrorState } from "@/components/common/feedback";
import { withToast } from "@/components/common/with-toast";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ExamplePreview } from "@/components/ui/example-preview";
import { Button } from "@/components/ui/button";
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
import { SettingGroup, SettingItem, SettingList, SettingsHeader, settingsStack } from "./settings-common";

/** Days of releases the page lists ahead. */
const UPCOMING_DAYS = 14;
/** Releases listed at most. */
const UPCOMING_ROWS = 8;

/** Settings → Release schedules (§21): the schedules, and the next releases with one-off changes. */
export function ReleaseSettings() {
  const business = useCurrentBusiness();
  const schedules = useReleaseSchedules(business.id);
  const services = useServices(business.id);
  const groups = useCustomerGroups(business.id);
  const editor = useEditorDialog<ReleaseSchedule>();
  const bookable = (services.data ?? []).filter((s) => s.isActive && s.isPublic);
  const list = schedules.data ?? [];

  const newSchedule = (
    <ActionButton
      size="sm"
      variant="primary"
      onClick={() => editor.open(null)}
      icon={<Plus />}
      label="New schedule"
      collapse={false}
      disabled={bookable.length === 0}
    />
  );

  return (
    <>
      <SettingsHeader segment="release-schedules" lede actions={list.length > 0 && newSchedule} />
      {schedules.isError ? (
        <ErrorState error={schedules.error} onRetry={() => schedules.refetch()} />
      ) : schedules.isPending || services.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <div className={settingsStack}>
          <SettingGroup
            title={list.length > 0 ? "Your schedules" : "What a schedule looks like"}
            description="For example, the day before at 17:00. Your team can always book any free time."
            note={list.length > 0 && <UncoveredNote schedules={list} services={bookable} />}
          >
            {list.length === 0 ? (
              <>
                <ExamplePreview inset className="p-1.5">
                  <SettingList>
                    <SettingItem
                      title="Saturdays"
                      chips={
                        <Badge tone="success" dot className="h-5">
                          Active
                        </Badge>
                      }
                      meta={
                        <p className="text-[0.8125rem] leading-5">
                          Opens on Friday at 17:00, for all services
                        </p>
                      }
                    />
                  </SettingList>
                </ExamplePreview>
                <EmptyState
                  size="sm"
                  headingLevel={4}
                  title="Every day is open"
                  description="Every day can be booked as far ahead as your policies allow."
                  action={newSchedule}
                />
              </>
            ) : (
              <SettingList>
                {list.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    services={services.data ?? []}
                    groups={groups.data ?? []}
                    onEdit={() => editor.open(s)}
                  />
                ))}
              </SettingList>
            )}
          </SettingGroup>
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

function ScheduleRow({
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
    <SettingItem
      dimmed={paused}
      title={schedule.name}
      chips={
        <Badge tone={paused ? "neutral" : "success"} dot className="h-5">
          {paused ? "Paused" : "Active"}
        </Badge>
      }
      meta={
        <>
          <p className="text-[0.8125rem] leading-5">
            {scheduleSummary(schedule, business.locale || DEFAULT_LOCALE)}
          </p>
          <p className="text-[0.8125rem] leading-5 text-muted-foreground">
            {servicesLabel(schedule.serviceIds, services)} · {whoLabel(schedule, groups)}
          </p>
        </>
      }
      actions={
        <>
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
        </>
      }
    />
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
    <p className="flex items-start gap-2">
      <LockOpen className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {list} {names.length === 1 ? "isn't" : "aren't"} in an active schedule: they can be booked as far
        ahead as your policies allow.
      </span>
    </p>
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
    <SettingGroup
      title="Upcoming releases"
      description="Change one release without changing its schedule, like one meeting in a recurring series."
      action={
        schedules.length > 1 && (
          <SegmentedControl
            aria-label="Schedule"
            size="sm"
            value={scheduleId}
            onValueChange={setChosen}
            options={schedules.map((s) => ({ value: s.id, label: s.name }))}
          />
        )
      }
    >
      {releases.isError ? (
        <div className="p-4.5">
          <ErrorState error={releases.error} onRetry={() => releases.refetch()} />
        </div>
      ) : releases.isPending ? (
        <div className="p-4.5">
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4.5 py-4 text-sm text-muted-foreground">
          Nothing to release in the next {UPCOMING_DAYS} days: every day with free times is already open.
        </p>
      ) : (
        <SettingList aria-label="Upcoming releases">
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
        </SettingList>
      )}
    </SettingGroup>
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
    <li className="flex min-h-14.5 flex-wrap items-center gap-x-4 gap-y-2 px-4.5 py-3">
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
