"use client";

import { useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  LayoutGrid,
  ChartNoAxesColumn,
  Building2,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eventFill, PhoneFrame, SceneToggle } from "./scene-parts";
import { useScene } from "./use-scene";

const STEPS = [1900, 1900, 1800, 5200] as const;
const PAID = STEPS.length - 1;

const SERVICES = [
  { name: "Initial assessment", meta: "1 hour", price: "€70" },
  { name: "Sports massage", meta: "45 minutes", price: "€45", picked: true },
  { name: "Follow-up treatment", meta: "30 minutes", price: "€40" },
];
const TIMES = ["09:30", "11:00", "14:00", "15:30", "16:15", "17:00"];

function PhoneBody({ step }: { step: number }) {
  if (step === PAID) {
    return (
      <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="grid size-14 animate-pop-in place-items-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check className="size-7" />
        </span>
        <p className="text-xl font-semibold tracking-tight">You&apos;re booked</p>
        <p className="text-sm text-muted-foreground">
          Thursday 5 November, 15:30
          <br />
          Sports massage with Sam
        </p>
        <p className="mt-2 text-xs text-subtle-foreground">€45 paid. Confirmation sent by email.</p>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="flex flex-1 animate-fade-in flex-col gap-4 px-4">
        <p className="text-lg font-semibold tracking-tight">Check and pay</p>
        <dl className="flex flex-col gap-2 rounded-xl border border-border p-3.5 text-sm">
          {[
            ["Sports massage", "€45"],
            ["Thursday 5 November", "15:30"],
            ["With", "Sam"],
          ].map(([a, b]) => (
            <div key={a} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{a}</dt>
              <dd className="tnum font-medium">{b}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-col gap-2 pb-5">
          <span className="rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
            Pay €45
          </span>
          <span className="text-center text-xs text-subtle-foreground">Card, Apple Pay or Google Pay</span>
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="flex flex-1 animate-fade-in flex-col gap-3 px-4">
        <p className="text-lg font-semibold tracking-tight">Pick a time</p>
        <p className="text-sm text-muted-foreground">Thursday 5 November</p>
        <div className="grid grid-cols-3 gap-2">
          {TIMES.map((t) => (
            <span
              key={t}
              className={cn(
                "tnum rounded-lg border border-border py-2.5 text-center text-sm font-medium",
                t === "15:30" && "border-transparent bg-primary text-primary-foreground",
              )}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 animate-fade-in flex-col gap-3 px-4">
      <p className="text-lg font-semibold tracking-tight">Choose a service</p>
      {SERVICES.map((s) => (
        <div
          key={s.name}
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-border p-3.5",
            s.picked && "border-foreground",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.meta}</span>
          </span>
          <span className="tnum text-sm font-semibold">{s.price}</span>
        </div>
      ))}
    </div>
  );
}

const RAIL: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: LayoutGrid, label: "Today" },
  { icon: CalendarDays, label: "Calendar", active: true },
  { icon: Users, label: "Customers" },
  { icon: Building2, label: "Business" },
  { icon: ChartNoAxesColumn, label: "Reports" },
];

const HOURS = ["13:00", "14:00", "15:00", "16:00", "17:00"];
const FIRST_HOUR = 13;
const SPAN = HOURS.length;

type Slot = { who: string; start: number; end: number; title: string; sub: string; chart: number };
const COLUMNS = ["Aoife", "Sam", "Niamh"];
const BOOKINGS: Slot[] = [
  { who: "Aoife", start: 13, end: 14, title: "Toby Marsh", sub: "Initial assessment", chart: 3 },
  { who: "Aoife", start: 14.5, end: 15.25, title: "Avery Lane", sub: "Sports massage", chart: 1 },
  { who: "Aoife", start: 16, end: 17, title: "Casey Rowe", sub: "Initial assessment", chart: 3 },
  { who: "Sam", start: 13.5, end: 14.25, title: "Remy Stroud", sub: "Sports massage", chart: 1 },
  { who: "Niamh", start: 13, end: 13.5, title: "Dara Quinn", sub: "Follow-up", chart: 6 },
  { who: "Niamh", start: 14, end: 15, title: "Jo Hayes", sub: "Initial assessment", chart: 3 },
  { who: "Niamh", start: 15.5, end: 16, title: "Eli Byrne", sub: "Follow-up", chart: 6 },
];
const NEW_BOOKING: Slot = {
  who: "Sam",
  start: 15.5,
  end: 16.25,
  title: "Rory Kane",
  sub: "Sports massage · €45 paid",
  chart: 1,
};

function Booking({ slot, fresh }: { slot: Slot; fresh?: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-xs leading-4 shadow-xs",
        fresh && "animate-pop-in shadow-md ring-2 ring-brand",
      )}
      style={{
        ...eventFill(slot.chart),
        top: `${String(((slot.start - FIRST_HOUR) / SPAN) * 100)}%`,
        height: `${String(((slot.end - slot.start) / SPAN) * 100)}%`,
      }}
    >
      <p className="truncate font-semibold">{slot.title}</p>
      <p className="truncate text-muted-foreground">{slot.sub}</p>
    </div>
  );
}

function CalendarWindow({ booked }: { booked: boolean }) {
  return (
    <div className="relative flex h-[33rem] min-w-0 overflow-hidden rounded-2xl bg-background text-left shadow-[0_40px_80px_-40px_rgb(0_0_0/0.35)] ring-1 ring-border">
      <div className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1 bg-surface-sunken py-4 max-sm:hidden">
        {RAIL.map(({ icon: Icon, label, active }) => (
          <span
            key={label}
            className={cn(
              "flex w-[3.75rem] flex-col items-center gap-1 rounded-xl py-2 text-[0.6875rem] text-muted-foreground",
              active && "bg-surface font-medium text-foreground shadow-xs",
            )}
          >
            <Icon className="size-4.5" />
            {label}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <p className="truncate text-base font-semibold tracking-tight sm:text-lg">Thursday, 5 November</p>
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
            <Plus className="size-3.5" /> New booking
          </span>
        </div>
        <div className="grid grid-cols-[2.75rem_repeat(2,minmax(0,1fr))] border-y border-border text-sm font-medium sm:grid-cols-[2.75rem_repeat(3,minmax(0,1fr))]">
          <span />
          {COLUMNS.map((c, i) => (
            <span key={c} className={cn("truncate px-2 py-2", i === 2 && "max-sm:hidden")}>
              {c}
            </span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[2.75rem_repeat(2,minmax(0,1fr))] sm:grid-cols-[2.75rem_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col">
            {HOURS.map((h) => (
              <span
                key={h}
                className="tnum flex-1 pt-1 pr-1.5 text-right text-[0.6875rem] text-subtle-foreground"
              >
                {h}
              </span>
            ))}
          </div>
          {COLUMNS.map((c, i) => (
            <div
              key={c}
              className={cn(
                "relative border-l border-border-subtle bg-[linear-gradient(var(--border-subtle)_1px,transparent_1px)] bg-[size:100%_20%]",
                i === 2 && "max-sm:hidden",
              )}
            >
              {BOOKINGS.filter((b) => b.who === c).map((b) => (
                <Booking key={b.title} slot={b} />
              ))}
              {booked && NEW_BOOKING.who === c && <Booking slot={NEW_BOOKING} fresh />}
            </div>
          ))}
        </div>
      </div>
      {booked && (
        <div className="absolute right-3 bottom-3 flex animate-pop-in items-center gap-2.5 rounded-xl bg-surface-raised px-3 py-2.5 text-sm shadow-lg ring-1 ring-border">
          <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
            <Check className="size-3.5" />
          </span>
          <span>
            <span className="block font-semibold">New booking</span>
            <span className="block text-xs text-muted-foreground">Rory Kane, 15:30 with Sam</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** The customer's phone and the business's calendar, side by side: tap through a booking and it lands on the day. */
export function BookedScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const step = useScene(ref, STEPS, paused);
  const booked = step === PAID;

  return (
    <div ref={ref}>
      <div
        aria-hidden
        inert
        className="grid items-center gap-5 lg:grid-cols-[19rem_4rem_minmax(0,1fr)] lg:gap-0"
      >
        <PhoneFrame className="mx-auto w-full max-w-[19rem]">
          <div className="flex items-center gap-2.5 px-4 pt-11 pb-4">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-xs font-semibold text-brand-foreground">
              LP
            </span>
            <span className="text-sm font-semibold">Lumen Physio</span>
          </div>
          <PhoneBody step={step} />
        </PhoneFrame>
        <svg viewBox="0 0 64 120" className="h-24 w-full overflow-visible max-lg:hidden">
          <defs>
            <linearGradient id="booked-thread" x1="0" x2="1">
              <stop offset="0" stopColor="#8fd8f2" />
              <stop offset="0.5" stopColor="#7a6af0" />
              <stop offset="1" stopColor="#ffbf9c" />
            </linearGradient>
          </defs>
          <path
            d="M-4 60 C 24 60, 40 60, 68 60"
            fill="none"
            stroke="url(#booked-thread)"
            strokeWidth="2"
            pathLength={1}
            strokeDasharray="1"
            className="transition-[stroke-dashoffset] duration-500 ease-out"
            style={{ strokeDashoffset: booked ? 0 : 1 }}
          />
        </svg>
        <CalendarWindow booked={booked} />
      </div>
      <div className="mt-5 flex justify-center">
        <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />
      </div>
    </div>
  );
}
