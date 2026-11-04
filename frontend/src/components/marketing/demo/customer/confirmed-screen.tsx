"use client";

import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  Clock,
  CreditCard,
  Download,
  LinkIcon,
  MapPin,
  UserRound,
} from "lucide-react";
import { bookingEnd, formatAddress } from "@/lib/booking/booking";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { formatDate, formatDuration, formatTimeRange, zonedToIso, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { floatingSurface } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { useDemoTarget } from "../engine/demo-context";
import { ShellFooter, ShellHeader } from "./booking-page";
import { LUMEN } from "./fixture";
import { PRICE } from "./review-step";
import { REFERENCE } from "./checkout-screen";

/*
 * Back from payment: the manage page (`/manage/[token]?payment=succeeded`), as
 * components/booking/{manage-booking,manage-hero,manage-booking-card,manage-prompts}.tsx render it for a guest.
 */

const TZ = LUMEN.timezone;

function Hero({ email, date }: { email: string; date: PlainDate }) {
  return (
    <div className="flex animate-rise items-start gap-4 py-2">
      <span
        aria-hidden
        className="relative mt-0.5 flex size-10 shrink-0 animate-pop-in items-center justify-center rounded-xl border border-success-border bg-success-soft text-success-soft-foreground [&_svg]:size-5"
      >
        <span className="absolute inset-0 animate-ping rounded-2xl bg-success/20 [animation-iteration-count:2]" />
        <Check strokeWidth={2.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">You&apos;re booked and paid</h2>
        <p className="text-pretty [overflow-wrap:anywhere] text-muted-foreground">
          We&apos;ve emailed the details to {email}. See you on {formatDate(date, TZ, "long", LUMEN.locale)}.
        </p>
      </div>
    </div>
  );
}

function Item({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 bg-surface py-3.5 pr-5 pl-12 dark:bg-surface-raised">
      <dt className="text-xs text-muted-foreground">
        <span className="absolute top-4 left-5 text-subtle-foreground [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function CalendarMenu() {
  return (
    <div className={cn(floatingSurface, "absolute top-0 left-4 w-max min-w-52 animate-pop-in p-1")}>
      {[
        { icon: <CalendarPlus />, label: "Google Calendar", id: "calendar-google" },
        { icon: <Download />, label: "Apple, Outlook & others (.ics)", id: "calendar-ics" },
      ].map((item) => (
        <MenuItem key={item.id} {...item} />
      ))}
    </div>
  );
}

function MenuItem({ id, icon, label }: { id: string; icon: React.ReactNode; label: string }) {
  const t = useDemoTarget(id);
  return (
    <div
      {...t.props}
      className={cn(
        "relative flex h-8 items-center gap-2 rounded-md px-2 text-sm select-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        t.pressed && "bg-accent",
      )}
    >
      {icon}
      {label}
    </div>
  );
}

function BookingCard({ date, time, menu }: { date: PlainDate; time: string; menu: boolean }) {
  const calendar = useDemoTarget("add-to-calendar");
  const start = zonedToIso(date, time, TZ);
  return (
    <div>
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs dark:bg-surface-raised">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <BookingStatusBadge status="confirmed" />
              <PaymentStatusBadge status="paid" />
            </div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">Initial assessment</h3>
          </div>
        </div>
        <dl className="grid gap-px border-t border-border-subtle bg-border-subtle">
          <Item icon={<Clock />} label="When">
            <span className="tnum">
              {formatDate(date, TZ, "dayMonth", LUMEN.locale)} ·{" "}
              {formatTimeRange(start, bookingEnd(start, 60), TZ, LUMEN.locale)}
            </span>
            <span className="text-muted-foreground"> ({formatDuration(60)})</span>
          </Item>
          <Item icon={<UserRound />} label="With">
            Sam Rivers · Treatment room 2
          </Item>
          <Item icon={<CreditCard />} label="Price">
            <span className="tnum">{PRICE}</span>
            <span className="text-muted-foreground"> · {PRICE} paid</span>
          </Item>
          <Item icon={<MapPin />} label="Where">
            {formatAddress(LUMEN.address)}
          </Item>
          <Item icon={<LinkIcon />} label="Reference">
            <span className="font-mono text-[0.8125rem] tracking-wide">{REFERENCE}</span>
          </Item>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-surface-sunken/60 p-4">
          <Button
            {...calendar.props}
            variant="secondary"
            tabIndex={-1}
            className={cn(calendar.pressed && "scale-[0.98] bg-accent")}
          >
            <CalendarPlus />
            Calendar
          </Button>
          <Button variant="secondary" tabIndex={-1}>
            <CalendarClock /> Reschedule
          </Button>
          <Button variant="danger-ghost" tabIndex={-1}>
            <CalendarX2 /> Cancel appointment
          </Button>
        </div>
      </section>
      {/* Radix renders the menu in a portal; here it hangs below the Calendar button, over the card's edge. */}
      <div className="relative">
        <div className="absolute -top-[55px] left-0">{menu && <CalendarMenu />}</div>
      </div>
    </div>
  );
}

export function ConfirmedScreen({
  date,
  time,
  email,
  calendarMenu,
}: {
  date: PlainDate;
  time: string;
  email: string;
  calendarMenu: boolean;
}) {
  return (
    <BusinessThemeProvider
      primaryColor={LUMEN.branding.primaryColor}
      className="flex min-h-full flex-col bg-background"
    >
      <ShellHeader action="Book again" />
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="flex flex-col gap-6">
          <Hero email={email} date={date} />
          <BookingCard date={date} time={time} menu={calendarMenu} />
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-5">
            <div>
              <p className="font-medium">Keep all your appointments in one place</p>
              <p className="text-sm text-muted-foreground">
                Create a free account with {email} to see and manage everything you book.
              </p>
            </div>
            <Button variant="secondary" tabIndex={-1} className="shrink-0">
              Create account <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
      <ShellFooter />
    </BusinessThemeProvider>
  );
}
