"use client";

import { CalendarRange, Clock, Copy, DoorOpen, Pencil, Plus, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDemoTarget } from "../../engine/demo-context";
import { DemoInput } from "../../engine/controls";
import { CALENDAR_RESOURCES, type DayHours } from "../state";

const SUBTITLE = ["Not linked", "Linked to Casey Lane", "Space", "Space"];

function DayRow({ day, index }: { day: DayHours; index: number }) {
  const toggle = useDemoTarget(`day-${String(index)}-toggle`);
  const open = day.ranges.length > 0;
  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <div className="flex h-9 w-36 shrink-0 items-center gap-3">
        <span
          {...toggle.props}
          className={cn("flex rounded-full transition-transform", toggle.hovered && "scale-105")}
        >
          <Switch size="sm" checked={open} tabIndex={-1} />
        </span>
        <span className={cn("text-sm font-medium", !open && "text-muted-foreground")}>{day.day}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {!open ? (
          <span className="text-sm leading-9 text-subtle-foreground">Closed</span>
        ) : (
          day.ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <DemoInput
                id={`day-${String(index)}-start`}
                size="sm"
                value={r.start}
                leading={<Clock />}
                className="tnum w-28"
              />
              <span className="text-subtle-foreground">–</span>
              <DemoInput
                id={`day-${String(index)}-end`}
                size="sm"
                value={r.end}
                leading={<Clock />}
                className="tnum w-28"
              />
              <span className="flex size-8 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </span>
            </div>
          ))
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-0.5 text-muted-foreground">
        {open && (
          <span className="flex size-8 items-center justify-center">
            <Plus className="size-4" />
          </span>
        )}
        <span className="flex size-8 items-center justify-center">
          <Copy className="size-4" />
        </span>
      </div>
    </div>
  );
}

/** Therapists: the resource list, and Sam Rivers' weekly hours. */
export function TherapistsScreen({ hours, dirty }: { hours: DayHours[]; dirty: boolean }) {
  const save = useDemoTarget("hours-save");
  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex items-end justify-between gap-4 pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight">Therapists</p>
          <p className="text-sm text-muted-foreground">
            The people, rooms and equipment you book — and when they&apos;re available.
          </p>
        </div>
        <Button tabIndex={-1} variant="primary">
          <Plus /> Add therapist
        </Button>
      </header>
      <div className="grid grid-cols-[16rem_minmax(0,1fr)] items-start gap-6">
        <nav className="flex flex-col gap-1.5">
          {CALENDAR_RESOURCES.map((r, i) => (
            <span
              key={r.name}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                i === 0 ? "border-border bg-surface shadow-xs dark:bg-surface-raised" : "border-transparent",
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: r.color }}
              >
                {r.kind === "person" ? <User className="size-4" /> : <DoorOpen className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="truncate text-xs text-muted-foreground">{SUBTITLE[i]}</span>
              </span>
            </span>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">Sam Rivers</p>
              <p className="text-sm text-muted-foreground">
                Person · Chartered physiotherapist. Special interest in running injuries and knee rehab.
              </p>
            </div>
            <Button tabIndex={-1} size="sm">
              <Pencil /> Edit
            </Button>
          </div>
          <Tabs value="hours" className="mt-4">
            <TabsList>
              <TabsTrigger value="hours" tabIndex={-1}>
                Weekly hours
              </TabsTrigger>
              <TabsTrigger value="exceptions" tabIndex={-1}>
                Time off and extra hours
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Regular hours</span>
              <span className="tnum text-xs text-muted-foreground">
                {hours[5]?.ranges.length ? "38 h a week" : "34 h a week"}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs font-medium">
                <CalendarRange className="size-3.5" /> Seasonal hours
              </span>
            </div>
            <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface dark:bg-surface-raised">
              {hours.map((d, i) => (
                <DayRow key={d.day} day={d} index={i} />
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              {dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
              <Button tabIndex={-1} variant="ghost" disabled={!dirty}>
                Discard
              </Button>
              <Button
                {...save.props}
                tabIndex={-1}
                variant="primary"
                disabled={!dirty}
                className={cn(save.hovered && dirty && "bg-primary-hover", save.pressed && "scale-[0.98]")}
              >
                Save hours
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
