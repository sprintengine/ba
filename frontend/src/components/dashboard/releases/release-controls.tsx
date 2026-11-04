"use client";

import { useState } from "react";
import { CalendarClock, Check, Clock, Lock, LockOpen, Pause, Undo2, Zap } from "lucide-react";
import type { ReleaseChangeInput, ReleaseDay, ReleaseScope } from "@/lib/api/types";
import { useChangeRelease, useResetRelease } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  addDaysToPlainDate,
  todayInTz,
  toPlainDate,
  toTimeOfDay,
  zonedToIso,
  type PlainDate,
  type TimeOfDay,
} from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { useNow } from "@/lib/hooks/use-now";
import { opensLabel } from "@/lib/releases/text";
import { cn } from "@/lib/utils";
import { withToast } from "@/components/common/with-toast";
import { Button } from "@/components/ui/button";
import { CheckboxItem } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeInput } from "@/components/ui/time-input";

/** One schedule's release of one day, and what's needed to change it. */
export type ReleaseTarget = {
  scheduleId: string;
  scheduleName: string;
  day: ReleaseDay;
  /** The schedule opens other days at the same moment (a week, a weekend): a change covers them unless "just this day". */
  multiDay: boolean;
};

/** Open now, move, hold or reset one release, with a toast for each. */
export function useReleaseControls(target: ReleaseTarget) {
  const business = useCurrentBusiness();
  const change = useChangeRelease(business.id);
  const reset = useResetRelease(business.id);
  const { scheduleId, day } = target;
  const run = (input: ReleaseChangeInput, done: string) =>
    withToast(() => change.mutateAsync({ scheduleId, date: day.date, input }), done);
  return {
    pending: change.isPending || reset.isPending,
    openNow: (scope: ReleaseScope = "release") => run({ action: "open_now", scope }, "Opened for booking"),
    hold: (scope: ReleaseScope = "release") => run({ action: "hold", scope }, "On hold until you open it"),
    move: (opensAt: string, scope: ReleaseScope = "release") =>
      run({ action: "move", opensAt, scope }, "Release time changed"),
    reset: (scope: ReleaseScope = "release") =>
      withToast(() => reset.mutateAsync({ scheduleId, date: day.date, scope }), "Back on schedule"),
  };
}

/** "Opens today at 22:00" / "Open since yesterday at 17:00" / "On hold", with an icon. */
export function ReleaseHeadline({ day, className }: { day: ReleaseDay; className?: string }) {
  const business = useCurrentBusiness();
  const now = useNow();
  const locale = business.locale || DEFAULT_LOCALE;
  const at = (iso: string) => opensLabel(iso, business.timezone, locale, now);
  if (day.state === "held" || day.opensAt === null) {
    return (
      <p className={cn("flex items-center gap-1.5 font-semibold tracking-tight", className)}>
        <Pause className="size-4 shrink-0 text-danger" /> On hold until you open it
      </p>
    );
  }
  if (day.state === "open") {
    return (
      <p className={cn("flex items-center gap-1.5 font-semibold tracking-tight", className)}>
        <LockOpen className="size-4 shrink-0 text-success" /> Open since {at(day.opensAt)}
      </p>
    );
  }
  return (
    <p className={cn("flex items-center gap-1.5 font-semibold tracking-tight", className)}>
      <Lock
        className={cn("size-4 shrink-0", day.state === "moved" ? "text-warning" : "text-muted-foreground")}
      />
      Opens {at(day.opensAt)}
    </p>
  );
}

/** "Moved from 17:00 by Demo Owner" / "Opened early by …" / "Held by …", or nothing for an unchanged release. */
export function changeNote(day: ReleaseDay, scheduledLabel: string): string | null {
  if (!day.changed) return null;
  const by = day.changedBy ? ` by ${day.changedBy}` : "";
  if (day.state === "held") return `Held${by}`;
  if (day.state === "open") return `Opened early${by} · scheduled ${scheduledLabel}`;
  return `Moved from ${scheduledLabel}${by}`;
}

/** The release's own date and time inputs, with a save button; it must open before the day ends. */
export function ChangeTimeFields({
  target,
  scope,
  onDone,
}: {
  target: ReleaseTarget;
  scope: ReleaseScope;
  onDone?: () => void;
}) {
  const business = useCurrentBusiness();
  const tz = business.timezone;
  const controls = useReleaseControls(target);
  const current = target.day.opensAt ?? target.day.scheduledAt;
  const [date, setDate] = useState<PlainDate>(toPlainDate(current, tz));
  const [time, setTime] = useState<TimeOfDay | null>(toTimeOfDay(current, tz));
  const today = todayInTz(tz);
  const dayEnds = zonedToIso(addDaysToPlainDate(target.day.date, 1), "00:00", tz);
  const opensAt = time ? zonedToIso(date, time, tz) : null;
  const error =
    opensAt && Date.parse(opensAt) >= Date.parse(dayEnds) ? "It has to open before the day ends" : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Field label="Day" className="flex-1">
          <DatePicker
            size="sm"
            value={date}
            onValueChange={setDate}
            min={today}
            max={target.day.date}
            timeZone={tz}
          />
        </Field>
        <Field label="Time" error={error ?? undefined}>
          <TimeInput value={time} onValueChange={setTime} className="h-8 w-24" />
        </Field>
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={!opensAt || !!error || controls.pending}
        onClick={async () => {
          if (opensAt && (await controls.move(opensAt, scope))) onDone?.();
        }}
      >
        <Check /> Save time
      </Button>
    </div>
  );
}

/** "Just this day" for a release that opens several days at once. */
function ScopeChoice({
  target,
  scope,
  onScopeChange,
}: {
  target: ReleaseTarget;
  scope: ReleaseScope;
  onScopeChange: (s: ReleaseScope) => void;
}) {
  if (!target.multiDay) return null;
  return (
    <CheckboxItem
      label="Just this day"
      description="Otherwise the change covers every day this release opens."
      checked={scope === "day"}
      onCheckedChange={(c) => onScopeChange(c === true ? "day" : "release")}
    />
  );
}

/**
 * Everything one release can do, as the calendar's popover shows it: when it opens and why, how many times it opens,
 * then change the time, open now, hold, or go back to the schedule. Only this release changes.
 */
export function ReleasePanel({
  target,
  before,
  onDone,
}: {
  target: ReleaseTarget;
  /** The open day before this one and its free times (what's still to fill before this day opens). */
  before?: { label: string; times: number } | null;
  onDone?: () => void;
}) {
  const business = useCurrentBusiness();
  const locale = business.locale || DEFAULT_LOCALE;
  const controls = useReleaseControls(target);
  const [scope, setScope] = useState<ReleaseScope>("release");
  const { day } = target;
  const scheduledLabel = opensLabel(day.scheduledAt, business.timezone, locale);
  const note = changeNote(day, scheduledLabel);
  // Close only when the change went through (the toast says why otherwise).
  const after = async (p: Promise<boolean>) => {
    if (await p) onDone?.();
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{target.scheduleName}</p>
        <ReleaseHeadline day={day} className="mt-1" />
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-sunken/60 p-3 text-sm">
        <div>
          <p className="tnum text-lg font-semibold">{day.times}</p>
          <p className="text-xs text-muted-foreground">
            {day.state === "open" ? "Free times" : "Free times will open"}
          </p>
        </div>
        {before && (
          <div>
            <p className="tnum text-lg font-semibold">{before.times}</p>
            <p className="text-xs text-muted-foreground">Still free {before.label}</p>
          </div>
        )}
      </div>
      <ScopeChoice target={target} scope={scope} onScopeChange={setScope} />
      {day.state !== "open" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Change this release</p>
          <ChangeTimeFields target={target} scope={scope} onDone={onDone} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {day.state !== "open" && (
          <Button
            size="sm"
            variant="brand"
            disabled={controls.pending}
            onClick={() => after(controls.openNow(scope))}
          >
            <Zap /> Open now
          </Button>
        )}
        {day.state !== "held" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={controls.pending}
            onClick={() => after(controls.hold(scope))}
          >
            <Pause /> {day.state === "open" ? "Close again" : "Hold"}
          </Button>
        )}
      </div>
      {day.changed && (
        <Button
          size="sm"
          variant="ghost"
          className="justify-start text-muted-foreground"
          disabled={controls.pending}
          onClick={() => after(controls.reset(scope))}
        >
          <Undo2 /> Back to schedule ({scheduledLabel})
        </Button>
      )}
      <p className="flex items-start gap-1.5 border-t border-border-subtle pt-2 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
        Only this release changes. Edit the schedule in Settings to change every day.
      </p>
    </div>
  );
}

/** A "Change" button opening the time fields in a popover (lists and cards). */
export function ChangeTimePopover({
  target,
  size = "xs",
  variant = "ghost",
}: {
  target: ReleaseTarget;
  size?: "xs" | "sm";
  variant?: "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ReleaseScope>("release");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} variant={variant}>
          <Clock /> Change
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3">
        <p className="text-sm font-medium">When should it open?</p>
        <ScopeChoice target={target} scope={scope} onScopeChange={setScope} />
        <ChangeTimeFields target={target} scope={scope} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
