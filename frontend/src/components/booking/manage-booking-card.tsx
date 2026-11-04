"use client";

import { CalendarClock, CalendarX2, Clock, CreditCard, LinkIcon, MapPin, UserRound } from "lucide-react";
import type { ManagedBooking } from "@/lib/api/types";
import { balanceDueCents, bookingMinutes, formatAddress, showsPaymentStatus } from "@/lib/booking/booking";
import {
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTimeRange,
  toPlainDate,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DealBadge, DealPrice } from "@/components/offers/deal-price";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { AddToCalendar } from "./add-to-calendar";
import { DateTile } from "./date-tile";
import { CustomerPaymentBadge } from "./payment-badge";

/** The booking on the manage page: what, when, with whom, price, where, reference, and what can be done. */
export function ManageBookingCard({
  booking: b,
  noun,
  active,
  manageUrl,
  onReschedule,
  onCancel,
}: {
  booking: ManagedBooking;
  noun: string;
  /** Still to happen (and not cancelled/expired): show the actions. */
  active: boolean;
  manageUrl: string | null;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const tz = b.timezone;
  const address = formatAddress(b.business.address);
  return (
    <section
      aria-label={`Your ${noun}`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs dark:bg-surface-raised"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={b.status} />
            {showsPaymentStatus(b) && <CustomerPaymentBadge booking={b} />}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {b.service.name}
            {b.option && <span className="font-normal text-muted-foreground"> · {b.option.name}</span>}
          </h2>
          {b.addons.length > 0 && (
            <p className="text-sm text-muted-foreground">+ {b.addons.map((a) => a.name).join(", ")}</p>
          )}
        </div>
        <DateTile date={toPlainDate(b.start, tz)} timeZone={tz} size="lg" muted={!active} />
      </div>
      <dl className="grid gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
        <Item icon={<Clock />} label="When">
          <span className="tnum">
            {formatRelativeDay(b.start, tz)} · {formatTimeRange(b.start, b.end, tz)}
          </span>{" "}
          <span className="whitespace-nowrap text-muted-foreground">
            ({formatDuration(bookingMinutes(b))})
          </span>
        </Item>
        {b.resources.length > 0 && (
          <Item icon={<UserRound />} label="With">
            {b.resources.map((r) => r.name).join(" · ")}
          </Item>
        )}
        <Item icon={<CreditCard />} label="Price">
          <PriceDetails booking={b} active={active} />
        </Item>
        {address && (
          <Item icon={<MapPin />} label="Where">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.business.name}, ${address}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {address}
            </a>
          </Item>
        )}
        <Item icon={<LinkIcon />} label="Reference">
          <span className="font-mono text-[0.8125rem] tracking-wide">{b.reference}</span>
        </Item>
      </dl>
      {active && (
        <Actions
          booking={b}
          noun={noun}
          manageUrl={manageUrl}
          onReschedule={onReschedule}
          onCancel={onCancel}
        />
      )}
    </section>
  );
}

function Actions({
  booking: b,
  noun,
  manageUrl,
  onReschedule,
  onCancel,
}: {
  booking: ManagedBooking;
  noun: string;
  manageUrl: string | null;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-surface-sunken/60 p-4 sm:px-6">
        {b.status !== "held" && <AddToCalendar booking={b} manageUrl={manageUrl} />}
        {b.canReschedule && (
          <Button variant="secondary" onClick={onReschedule}>
            <CalendarClock /> Reschedule
          </Button>
        )}
        {b.canCancel && (
          <Button variant="danger-ghost" className="sm:ml-auto" onClick={onCancel}>
            <CalendarX2 /> Cancel {noun}
          </Button>
        )}
      </div>
      {!b.canCancel && !b.canReschedule && (
        <p className="border-t border-border-subtle px-5 py-3 text-sm text-muted-foreground sm:px-6">
          Need to change something? Contact {b.business.name} directly
          {b.business.contactPhone ? ` on ${b.business.contactPhone}` : ""}.
        </p>
      )}
    </>
  );
}

/**
 * The price (struck through when a deal applied), what was paid (a deposit: with what is left to pay at the
 * appointment, while it is still to come) or refunded, and the deal.
 */
function PriceDetails({ booking: b, active }: { booking: ManagedBooking; active: boolean }) {
  const deposit = balanceDueCents(b) !== null;
  const balance = active ? balanceDueCents(b) : null;
  return (
    <>
      {b.originalPriceCents != null && b.originalPriceCents > b.priceCents ? (
        <DealPrice
          originalCents={b.originalPriceCents}
          priceCents={b.priceCents}
          currency={b.currency}
          className="font-medium"
        />
      ) : (
        <span className="tnum">{formatPrice(b.priceCents, b.currency)}</span>
      )}
      {b.amountPaidCents > 0 && (
        <span className="text-muted-foreground">
          {" "}
          · {formatMoney(b.amountPaidCents, b.currency)} {deposit ? "deposit paid" : "paid"}
        </span>
      )}
      {balance !== null && (
        <span className="text-muted-foreground">
          {" "}
          · {formatMoney(balance, b.currency)} due at your appointment
        </span>
      )}
      {b.amountRefundedCents > 0 && (
        <span className="text-muted-foreground">
          {" "}
          · {formatMoney(b.amountRefundedCents, b.currency)} refunded
        </span>
      )}
      {b.offer && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <DealBadge label={b.offer.label} />
          <span className="text-muted-foreground">{b.offer.name}</span>
        </span>
      )}
    </>
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
  // Only `dt` and `dd` inside the `dl`'s item; the icon sits in the item's left padding.
  return (
    <div className="relative min-w-0 bg-surface py-3.5 pr-5 pl-12 sm:pr-6 sm:pl-13 dark:bg-surface-raised">
      <dt className="text-xs text-muted-foreground">
        <span className="absolute top-4 left-5 text-subtle-foreground sm:left-6 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
