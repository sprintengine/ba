"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock, Columns3, Plus } from "lucide-react";
import { formatDate, formatTime, minutesToTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarHeaderRow } from "@/components/dashboard/calendar/calendar-headers";
import { DayColumn, TimeGutter } from "@/components/dashboard/calendar/calendar-grid";
import { Button } from "@/components/ui/button";
import { demoDay } from "../home/fixture";
import { SceneToggle } from "../home/scene-parts";
import { photoSrc, type ExampleCard } from "./cards";
import {
  durationText,
  EXAMPLE_LOCALE,
  EXAMPLE_TZ,
  EXAMPLES,
  priceText,
  toBooking,
  type Example,
} from "./fixtures";
import { personTarget, typeTarget, type TourView } from "./tour";
import { Cursor, useTour } from "./use-tour";

type Columns = React.ComponentProps<typeof CalendarHeaderRow>["columns"];

const noop = () => undefined;
const time = (iso: string) => formatTime(iso, EXAMPLE_TZ, EXAMPLE_LOCALE);
const hourLabel = (h: number) => minutesToTime(h * 60);
/** The calendar's toolbar and names, around the hours. */
const CHROME_PX = 116;
const MIN_HOUR_PX = 44;

/** Who can do what, in both directions: the picked type's people, or the picked person's types. */
function matches(example: Example, view: TourView) {
  const chosen = example.types.find((t) => t.id === view.type);
  return {
    typeOn: (id: string) => {
      const t = example.types.find((x) => x.id === id);
      return !view.person || !!t?.staff.includes(view.person);
    },
    personOn: (id: string) => !chosen || chosen.staff.includes(id),
  };
}

function Choices({
  example,
  view,
  onType,
  onPerson,
}: {
  example: Example;
  view: TourView;
  onType: (id: string) => void;
  onPerson: (id: string) => void;
}) {
  const { typeOn, personOn } = matches(example, view);
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4 max-lg:shrink-0 max-lg:gap-2.5 max-lg:p-3 lg:w-72 lg:shrink-0 lg:border-r lg:border-border-subtle">
      <section className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground max-lg:sr-only">
          {example.types.length} appointment types
        </h3>
        <ul className="flex flex-col gap-0.5 max-lg:-mx-3 max-lg:scrollbar-none max-lg:flex-row max-lg:gap-1.5 max-lg:overflow-x-auto max-lg:[mask-image:linear-gradient(to_right,black_90%,transparent)] max-lg:px-3">
          {example.types.map((t) => (
            <li key={t.id} className="max-lg:shrink-0">
              <button
                type="button"
                data-cursor={typeTarget(t.id)}
                aria-pressed={view.type === t.id}
                onClick={() => onType(t.id)}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-[background-color,opacity] max-lg:whitespace-nowrap max-lg:ring-1 max-lg:ring-border",
                  view.type === t.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                  !typeOn(t.id) && "opacity-40",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="min-w-0 flex-1 lg:truncate">{t.name}</span>
                <span className="tnum shrink-0 text-xs text-muted-foreground max-lg:hidden">
                  {durationText(t.minutes)} · {priceText(t)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground max-lg:sr-only">Who does it</h3>
        <ul className="flex flex-col gap-0.5 max-lg:-mx-3 max-lg:scrollbar-none max-lg:flex-row max-lg:gap-1.5 max-lg:overflow-x-auto max-lg:[mask-image:linear-gradient(to_right,black_90%,transparent)] max-lg:px-3">
          {example.team.map((p) => (
            <li key={p.id} className="max-lg:shrink-0">
              <button
                type="button"
                data-cursor={personTarget(p.id)}
                aria-pressed={view.person === p.id}
                onClick={() => onPerson(p.id)}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-[background-color,opacity] max-lg:whitespace-nowrap max-lg:ring-1 max-lg:ring-border",
                  view.person === p.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                  !personOn(p.id) && "opacity-40",
                )}
              >
                <span className="min-w-0 flex-1">{p.name}</span>
                {view.type && personOn(p.id) && (
                  <Check
                    className="size-4 shrink-0 text-success max-lg:size-3.5"
                    aria-label="Does this one"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The new booking, as far as it's got: what, who, and the free times. */
function Draft({ example, picked }: { example: Example; picked: boolean }) {
  const { entry, times } = example.tour.booking;
  const [who, at, client, typeId] = entry;
  const chosen = example.types.find((t) => t.id === typeId);
  return (
    <div className="absolute top-14 right-3 z-50 w-72 max-w-[calc(100%-1.5rem)] animate-pop-in rounded-xl bg-surface-raised p-4 shadow-lg ring-1 ring-border">
      <p className="text-sm font-semibold">New booking</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {client}, {chosen?.name} with {example.team.find((t) => t.id === who)?.name}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {times.map((t) => (
          <span
            key={t}
            data-cursor={t === at ? "draft-time" : undefined}
            className={cn(
              "tnum rounded-lg border py-1.5 text-center text-sm font-medium transition-colors",
              picked && t === at
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <span
        data-cursor="draft-book"
        className={cn(
          "mt-3 flex h-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity",
          !picked && "opacity-40",
        )}
      >
        Book
      </span>
    </div>
  );
}

/** The real calendar's header row, gutter, columns and cards, on the example's day. */
function Calendar({ example, view }: { example: Example; view: TourView }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [first, last] = example.hours;
  const date = useMemo(() => demoDay(), []);
  const { personOn } = matches(example, view);
  const narrow = size.width > 0 && size.width < 620;
  const landed = view.booked ? example.tour.booking.entry : null;
  const shown = useMemo(() => {
    const focus = view.person
      ? example.team.filter((t) => t.id === view.person)
      : example.team.filter((t) => personOn(t.id));
    const only = landed ? example.team.filter((t) => t.id === landed[0]) : focus;
    if (narrow) return only.slice(0, 1);
    return view.person ? focus : example.team;
  }, [example.team, view.person, narrow, landed, personOn]);
  const columns = useMemo<Columns>(
    () =>
      shown.map((resource) => ({
        key: resource.id,
        date,
        resource,
        bookings: [...example.day, ...(landed ? [landed] : [])]
          .filter((e) => e[0] === resource.id)
          .map((e) => toBooking(example, e, date)),
        open: [{ start: first * 60, end: last * 60 }],
        blocked: [],
        off: null,
      })),
    [shown, date, example, landed, first, last],
  );
  const hourPx = Math.max(MIN_HOUR_PX, Math.floor((size.height - CHROME_PX) / (last - first)));
  return (
    <div ref={box} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-2 px-4 py-2.5" aria-hidden>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-lg font-semibold tracking-tight whitespace-nowrap max-sm:text-base">
          {formatDate(date, EXAMPLE_TZ, "long", EXAMPLE_LOCALE)}
          <ChevronDown className="size-4 text-subtle-foreground" />
        </span>
        <span className="flex-1" />
        <span className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground ring-1 ring-border max-sm:hidden">
          <Columns3 className="size-4" /> Day
        </span>
        <span
          data-cursor="new-booking"
          className="flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground"
        >
          <Plus className="size-4" /> New booking
        </span>
      </div>
      <div aria-hidden inert className="@container min-h-0 flex-1 overflow-hidden border-t border-border">
        <div className="relative z-40">
          <CalendarHeaderRow columns={columns} view="day" today={date} loading={false} onOpenDay={noop} />
        </div>
        <div className="flex">
          <div className="sticky left-0 z-30 bg-background">
            <TimeGutter
              startHour={first}
              endHour={last}
              formatHour={hourLabel}
              nowMinute={example.now}
              hourPx={hourPx}
            />
          </div>
          <div className="flex min-w-0 flex-1">
            {columns.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "flex min-w-0 flex-1 transition-opacity duration-300",
                  !personOn(c.key) && "opacity-30",
                )}
              >
                <DayColumn
                  date={c.date}
                  timeZone={EXAMPLE_TZ}
                  bookings={c.bookings}
                  open={c.open}
                  startHour={first}
                  endHour={last}
                  nowMinute={example.now}
                  blocked={c.blocked}
                  formatTime={time}
                  onSelectBooking={noop}
                  resourceId={c.key}
                  hourPx={hourPx}
                  label={c.resource?.name ?? ""}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {view.draft && <Draft example={example} picked={view.draft === "time"} />}
      {landed && (
        <div className="absolute right-3 bottom-3 z-50 flex animate-pop-in items-center gap-2.5 rounded-xl bg-surface-raised px-3 py-2.5 text-sm shadow-lg ring-1 ring-border">
          <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
            <Check className="size-3.5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">New booking</span>
            <span className="tnum block text-xs text-muted-foreground">
              {landed[2]}, {landed[1]}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function Tour({ card, example }: { card: ExampleCard; example: Example }) {
  const root = useRef<HTMLDivElement>(null);
  const { view, paused, reduce, cursor, toggle, choose } = useTour(example, root);
  return (
    <div
      ref={root}
      className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle p-3 sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static photo the card has already drawn */}
        <img
          src={photoSrc(card.photo, 480)}
          alt=""
          width={72}
          height={48}
          className="h-10 w-15 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{card.label}, an example</h3>
          <p className="text-sm text-pretty text-muted-foreground lg:truncate">
            {card.shape}. Made-up bookings on the real calendar.
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Choices
          example={example}
          view={view}
          onType={(id) => choose({ type: view.type === id ? null : id })}
          onPerson={(id) => choose({ person: view.person === id ? null : id })}
        />
        <Calendar example={example} view={view} />
      </div>
      <footer className="flex shrink-0 items-center gap-3 border-t border-border-subtle px-4 py-2.5">
        <p className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-sm text-foreground sm:min-h-8">
          <Clock className="size-4 shrink-0 text-muted-foreground max-sm:hidden" aria-hidden />
          <span key={view.say} className="animate-fade-in">
            {view.say}
          </span>
        </p>
        {card.page && (
          <Button asChild variant="secondary" size="sm" className="max-sm:hidden">
            <Link href={`/for/${card.page}`}>
              More on this <ArrowRight />
            </Link>
          </Button>
        )}
        <Button asChild variant="primary" size="sm" className="max-sm:hidden">
          <Link href="/sign-up">Start for free</Link>
        </Button>
        {!reduce && <SceneToggle paused={paused} onToggle={toggle} />}
      </footer>
      {cursor && <Cursor {...cursor} />}
    </div>
  );
}

/** A kind of business, working on the page: its appointment types, its people and its calendar, with a cursor. */
export function ExampleStage({ card }: { card: ExampleCard }) {
  return <Tour key={card.slug} card={card} example={EXAMPLES[card.slug]} />;
}
