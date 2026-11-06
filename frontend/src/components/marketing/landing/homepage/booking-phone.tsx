"use client";

import { useMemo } from "react";
import { CalendarDays, ChevronLeft, Clock, Ellipsis, Lock, MapPin } from "lucide-react";
import { quote } from "@/lib/booking/quote";
import { EMPTY_SELECTION } from "@/lib/booking/selection";
import {
  addDaysToPlainDate,
  formatDate,
  formatDuration,
  formatTime,
  toTimeOfDay,
  type PlainDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { VocabularyProvider } from "@/lib/vocabulary";
import { ManageHeroBanner } from "@/components/booking/manage-hero";
import { ReviewStep } from "@/components/booking/review-step";
import { SlotGrid } from "@/components/booking/slot-grid";
import { StepProgress } from "@/components/booking/step-progress";
import { ServiceStep, StepHeader } from "@/components/booking/steps";
import { WeekStrip } from "@/components/booking/week-strip";
import { BusinessTile } from "@/components/shells/business-tile";
import { siteScopeProps } from "@/components/site/site-scope";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Slot } from "@/lib/api/types";
import {
  CLIENT,
  EARLIEST_TODAY,
  freeSlots,
  isOpenDay,
  LUMEN,
  LUMEN_STYLE,
  SERVICES,
  type DemoEntry,
} from "./fixture";
import type { BookingDemo } from "./use-booking-demo";

const SCOPE = siteScopeProps(LUMEN_STYLE.theme, LUMEN_STYLE.palette);
const TZ = LUMEN.timezone;
const STEPS = ["service", "time", "review"] as const;
const noop = () => undefined;
const payment = { offered: false, atVenue: false, setAtVenue: noop };
const details = { name: CLIENT.name, email: CLIENT.email, phone: CLIENT.phone, notes: "", answers: {} };

function Times({
  demo,
  entries,
  onPick,
}: {
  demo: BookingDemo;
  entries: DemoEntry[];
  onPick: (slot: Slot) => void;
}) {
  const service = demo.service ?? SERVICES[1]!;
  const min = demo.today;
  const earliest = demo.date === min ? EARLIEST_TODAY : 0;
  const slots = useMemo(
    () => freeSlots(entries, service, demo.date, earliest),
    [entries, service, demo.date, earliest],
  );
  return (
    <div className="flex flex-col gap-5">
      <WeekStrip
        timeZone={TZ}
        locale={LUMEN.locale}
        min={min}
        max={addDaysToPlainDate(min, 60)}
        date={demo.date}
        month={demo.date.slice(0, 7)}
        onMonthChange={noop}
        onDateChange={demo.pickDate}
        hasMarker={isOpenDay}
        isDateDisabled={(d: PlainDate) => !isOpenDay(d)}
        loaded={() => true}
      />
      <SlotGrid
        slots={slots}
        timeZone={TZ}
        locale={LUMEN.locale}
        selectedTime={demo.time}
        onSelect={onPick}
      />
    </div>
  );
}

function Review({ demo }: { demo: BookingDemo }) {
  const service = demo.service ?? SERVICES[1]!;
  return (
    <ReviewStep
      business={LUMEN}
      service={service}
      selection={{ ...EMPTY_SELECTION, serviceId: service.id, date: demo.date, time: demo.time }}
      quote={quote(service, null, [])}
      payment={payment}
      details={details}
      questions={[]}
      onEdit={(step) => demo.goTo(step === "time" ? "time" : "service")}
      alert={null}
    />
  );
}

/** Back from payment: the manage page's own headline, then what was booked. */
function Confirmed({ demo }: { demo: BookingDemo }) {
  const service = demo.service ?? SERVICES[1]!;
  const start = demo.startIso;
  const booking = {
    customer: { email: CLIENT.email },
    start,
    timezone: TZ,
    business: { name: LUMEN.name },
    amountRefundedCents: 0,
    currency: LUMEN.currency,
  } as never;
  return (
    <div className="flex flex-col gap-5">
      <ManageHeroBanner
        hero={{ kind: "confirmed", title: "You’re booked and paid", tone: "success" }}
        booking={booking}
        knowsBusiness
        remaining={null}
        noun="appointment"
        onPay={noop}
        paying={false}
      />
      <dl
        data-flight-from
        className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface px-4 shadow-xs"
      >
        {[
          [CalendarDays, "When", formatDate(demo.date, TZ, "long", LUMEN.locale)],
          [
            Clock,
            service.name,
            `${formatTime(start, TZ, LUMEN.locale)} · ${formatDuration(service.durationMinutes)}`,
          ],
          [MapPin, "Where", "Unit 4, Lantern Quay, Dublin"],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Clock;
          return (
            <div key={label as string} className="flex gap-3 py-3">
              <I className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label as string}</dt>
                <dd className="text-sm font-medium">{value as string}</dd>
              </div>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        Paid €{(service.priceCents / 100).toFixed(2)}. Change or cancel up to 24 hours before.
      </p>
    </div>
  );
}

const GLASS = "bg-white/85 shadow-[0_1px_8px_rgb(0_0_0/0.12)] ring-[0.5px] ring-black/10";

/** Safari's floating bar at the foot of the phone: back, the address, and more. */
function BrowserBar() {
  return (
    <div
      className="flex h-[3.25rem] shrink-0 items-center gap-2 bg-background px-3 pb-1 text-black"
      aria-hidden
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", GLASS)}>
        <ChevronLeft className="size-5.5" strokeWidth={2} />
      </span>
      <span
        className={cn(
          "flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full text-[0.9375rem]",
          GLASS,
        )}
      >
        <Lock className="size-3 text-black/50" strokeWidth={2.5} />
        <span className="truncate">bookanything.ie</span>
      </span>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", GLASS)}>
        <Ellipsis className="size-5.5" strokeWidth={2} />
      </span>
    </div>
  );
}

/**
 * Lumen's booking page as a phone shows it, built from the booking flow's own pieces: steps, service list, week strip,
 * time grid, review. The hero's script taps through it, and the booking lands on the calendar beside it.
 */
export function BookingPhone({ demo }: { demo: BookingDemo }) {
  const { step, entries } = demo;
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);
  const paying = step === "paying";
  const done = step === "done";
  const price = demo.service ? (demo.service.priceCents / 100).toFixed(0) : "";
  return (
    <div
      data-theme={SCOPE["data-theme"]}
      style={SCOPE.style}
      className={cn(
        SCOPE.className,
        "absolute inset-0 flex flex-col bg-background pt-[3.375rem] text-foreground",
      )}
    >
      <VocabularyProvider vocabulary={LUMEN.vocabulary}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-5">
          <BusinessTile
            name={LUMEN.name}
            logoUrl={LUMEN.branding.logoUrl}
            color={LUMEN.branding.primaryColor}
            size="lg"
            className="size-9"
          />
          <span className="line-clamp-1 text-base leading-tight font-semibold tracking-tight">
            {LUMEN.name}
          </span>
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-1 scrollbar-none flex-col gap-5 overflow-y-auto px-5 py-5",
            step === "review" &&
              "[mask-image:linear-gradient(180deg,black_calc(100%-3rem),transparent)] pb-12",
          )}
        >
          {!done && !paying && <StepProgress index={Math.max(stepIndex, 0)} total={STEPS.length} />}
          {step === "service" && (
            <>
              <StepHeader index={0} total={3} title="Choose a service" />
              <ServiceStep
                services={SERVICES}
                currency={LUMEN.currency}
                locale={LUMEN.locale}
                value={null}
                onSelect={demo.pickService}
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Live availability, confirmed by email. Change or cancel online up to 24 hours before. Secure
                payments.
              </p>
            </>
          )}
          {step === "time" && (
            <>
              <StepHeader index={1} total={3} title="Pick a time" onBack={() => demo.goTo("service")} />
              <Times
                demo={demo}
                entries={entries}
                onPick={(slot) => demo.pickTime(toTimeOfDay(slot.start, TZ))}
              />
            </>
          )}
          {step === "review" && (
            <>
              <StepHeader index={2} total={3} title="Check and pay" onBack={() => demo.goTo("time")} />
              <Review demo={demo} />
            </>
          )}
          {paying && (
            <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-4 text-center">
              <Spinner className="size-6" label="Paying" />
              <p className="font-medium">Paying €{price}</p>
            </div>
          )}
          {done && <Confirmed demo={demo} />}
        </div>
        {step === "review" && (
          <div className="shrink-0 border-t border-border bg-background px-4 py-3">
            <Button data-demo="pay" variant="primary" size="lg" className="w-full" onClick={demo.pay}>
              <Lock /> Pay €{price}
            </Button>
          </div>
        )}
        <BrowserBar />
        <div className="h-[1.625rem] shrink-0 bg-background" />
      </VocabularyProvider>
    </div>
  );
}
