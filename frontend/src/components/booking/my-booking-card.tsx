"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, Clock, CreditCard, Hourglass, MapPin, UserRound } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import {
  useCancelMyBooking,
  useMyBookingAvailabilityWindows,
  useMyBookingNextSlot,
  usePayMyBooking,
  useRescheduleMyBooking,
} from "@/lib/api/hooks";
import type { CustomerBooking } from "@/lib/api/types";
import {
  amountDueCents,
  balanceDueCents,
  bookingMinutes,
  shortAddress,
  showsPaymentStatus,
} from "@/lib/booking/booking";
import { formatCountdown } from "@/lib/booking/copy";
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  toPlainDate,
} from "@/lib/format";
import { useCountdown } from "@/lib/hooks/use-now";
import { isBlockingStatus, isReleasedStatus } from "@/lib/status";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { AddToCalendar } from "./add-to-calendar";
import { CancelBookingDialog } from "./cancel-booking";
import { DateTile } from "./date-tile";
import { CustomerPaymentBadge } from "./payment-badge";
import { ReschedulePanel, useRescheduleState } from "./reschedule";

/**
 * One booking on My bookings, in its business's colour, with pay / calendar / reschedule / cancel. `agentAction` opens
 * the cancel or reschedule dialog for an AI agent in the browser (WebMCP), for the customer to confirm or dismiss;
 * `onAgentActionDone` is called when they close it.
 */
export function MyBookingCard({
  booking: b,
  past,
  agentAction = null,
  onAgentActionDone,
}: {
  booking: CustomerBooking;
  past: boolean;
  agentAction?: "cancel" | "reschedule" | null;
  onAgentActionDone?: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const showCancel = cancelOpen || agentAction === "cancel";
  const showReschedule = rescheduleOpen || agentAction === "reschedule";
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (agentAction) card.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [agentAction]);
  const cancel = useCancelMyBooking();
  const remaining = useCountdown(b.status === "held" ? b.holdExpiresAt : null);
  const awaitingPayment = b.status === "held" && remaining !== null && remaining > 0;
  const inactive = past || isReleasedStatus(b.status);

  return (
    <BusinessThemeProvider primaryColor={b.business.branding.primaryColor}>
      <article
        ref={card}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-shadow hover:shadow-sm dark:bg-surface-raised",
          inactive && "bg-surface/60",
        )}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div className="flex gap-4 p-4 pl-5 sm:gap-5 sm:p-5 sm:pl-6">
          <DateTile
            date={toPlainDate(b.start, b.timezone)}
            timeZone={b.timezone}
            size="md"
            muted={inactive}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <CardHeading booking={b} />
            <CardFacts booking={b} inactive={inactive} />
            {awaitingPayment && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-warning-soft-foreground">
                <Hourglass className="size-3.5" aria-hidden />
                Held for <span className="tnum font-medium">{formatCountdown(remaining)}</span>. Pay now to
                confirm it.
              </p>
            )}
          </div>
        </div>
        {inactive ? (
          <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-2.5 sm:px-5">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${b.business.slug}`}>Book again</Link>
            </Button>
          </div>
        ) : (
          <CardActions
            booking={b}
            awaitingPayment={awaitingPayment}
            onReschedule={() => setRescheduleOpen(true)}
            onCancel={() => setCancelOpen(true)}
          />
        )}
      </article>
      <CancelBookingDialog
        booking={b}
        open={showCancel}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open && agentAction === "cancel") onAgentActionDone?.();
        }}
        cancel={(reason) => cancel.mutateAsync({ id: b.id, input: { reason } })}
        successMessage={`${b.service.name} with ${b.business.name} was cancelled`}
      />
      {showReschedule && (
        <RescheduleDialog
          booking={b}
          onClose={() => {
            setRescheduleOpen(false);
            if (agentAction === "reschedule") onAgentActionDone?.();
          }}
        />
      )}
    </BusinessThemeProvider>
  );
}

/** Business link, status badges and the service. */
function CardHeading({ booking: b }: { booking: CustomerBooking }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link
          href={`/${b.business.slug}`}
          className={cn(
            "inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
            touchHitArea,
          )}
        >
          <BusinessTile
            name={b.business.name}
            logoUrl={b.business.branding.logoUrl}
            color={b.business.branding.primaryColor}
            size="sm"
          />
          <span className="truncate">{b.business.name}</span>
        </Link>
        <span className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
          <BookingStatusBadge status={b.status} />
          {showsPaymentStatus(b) && <CustomerPaymentBadge booking={b} />}
        </span>
      </div>
      <h2 className="text-base font-semibold tracking-tight">
        {b.service.name}
        {b.option && <span className="font-normal text-muted-foreground"> · {b.option.name}</span>}
      </h2>
    </>
  );
}

/**
 * When (and how long), with whom, where, and what is left to pay at the appointment after a deposit (not once it
 * has passed or been cancelled).
 */
function CardFacts({ booking: b, inactive }: { booking: CustomerBooking; inactive: boolean }) {
  const tz = b.timezone;
  const place = shortAddress(b.business.address);
  const people = b.resources.map((r) => r.name).join(" · ");
  const balance = inactive ? null : balanceDueCents(b);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="tnum flex items-start gap-1.5">
        <Clock className="mt-[3px] size-3.5 shrink-0" aria-hidden />
        <span>
          {formatRelativeDay(b.start, tz)} · {formatTimeRange(b.start, b.end, tz)}{" "}
          <span className="whitespace-nowrap text-subtle-foreground">
            ({formatDuration(bookingMinutes(b))})
          </span>
        </span>
      </li>
      {people && (
        <li className="flex items-center gap-1.5">
          <UserRound className="size-3.5" aria-hidden /> {people}
        </li>
      )}
      {place && (
        <li className="flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden /> {place}
        </li>
      )}
      {balance !== null && (
        <li className="tnum flex items-center gap-1.5">
          <CreditCard className="size-3.5" aria-hidden /> {formatMoney(balance, b.currency)} due at your
          appointment
        </li>
      )}
    </ul>
  );
}

/** Pay now (while held), add to calendar, reschedule, cancel; nothing when none applies. */
function CardActions({
  booking: b,
  awaitingPayment,
  onReschedule,
  onCancel,
}: {
  booking: CustomerBooking;
  awaitingPayment: boolean;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const pay = usePayMyBooking();
  const accepted = isBlockingStatus(b.status) && b.status !== "held";
  if (!awaitingPayment && !b.canCancel && !b.canReschedule && !accepted) return null;
  const due = amountDueCents(b);
  const onPay = async () => {
    try {
      const { checkoutUrl } = await pay.mutateAsync(b.id);
      window.location.assign(checkoutUrl);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-border-subtle bg-surface-sunken/60 px-3 py-2.5 sm:gap-2 sm:px-5 sm:py-3">
      {awaitingPayment && (
        <Button variant="primary" className="max-sm:px-2.5" loading={pay.isPending} onClick={onPay}>
          <CreditCard /> Pay now{due > 0 ? ` · ${formatMoney(due, b.currency)}` : ""}
        </Button>
      )}
      {b.status !== "held" && <AddToCalendar booking={b} variant="ghost" className="max-sm:px-2.5" />}
      {b.canReschedule && (
        <Button variant="ghost" className="max-sm:px-2.5" onClick={onReschedule}>
          <CalendarClock /> Reschedule
        </Button>
      )}
      {b.canCancel && (
        <Button variant="danger-ghost" className="ml-auto max-sm:px-2.5" onClick={onCancel}>
          <CalendarX2 /> Cancel
        </Button>
      )}
    </div>
  );
}

function RescheduleDialog({ booking: b, onClose }: { booking: CustomerBooking; onClose: () => void }) {
  const state = useRescheduleState(b.timezone, 90);
  // The booking's own availability: its service, duration and customer group, ignoring its current time.
  const availability = useMyBookingAvailabilityWindows(b.id, state.windows);
  const next = useMyBookingNextSlot(b.id, state.nextWindows, state.after, availability.nextAvailableOnly);
  const reschedule = useRescheduleMyBooking();
  return (
    <Dialog open onOpenChange={(o) => !o && !reschedule.isPending && onClose()}>
      <DialogContent size="lg">
        <BusinessThemeProvider
          primaryColor={b.business.branding.primaryColor}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>Reschedule {b.service.name}</DialogTitle>
            <DialogDescription>
              With {b.business.name} · currently {formatDate(b.start, b.timezone, "dayMonth")} at{" "}
              {formatTime(b.start, b.timezone)}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="overflow-y-auto">
            <ReschedulePanel
              booking={b}
              state={state}
              availability={availability}
              next={next}
              pending={reschedule.isPending}
              reschedule={(start) => reschedule.mutateAsync({ id: b.id, input: { start } })}
              onDone={onClose}
              onCancel={onClose}
              inDialog
            />
          </DialogBody>
        </BusinessThemeProvider>
      </DialogContent>
    </Dialog>
  );
}
