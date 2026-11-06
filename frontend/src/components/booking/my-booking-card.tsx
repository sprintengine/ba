"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditCard, DoorOpen, Hourglass, MapPin, UserRound } from "lucide-react";
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
import { formatDate, formatDuration, formatMoney, formatTime, timeZoneLabel } from "@/lib/format";
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
import { BookingExceptions } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { AddToCalendar } from "./add-to-calendar";
import { CancelBookingDialog } from "./cancel-booking";
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
  featured = false,
  agentAction = null,
  onAgentActionDone,
}: {
  booking: CustomerBooking;
  past: boolean;
  /** The next visit: a ticket with its actions out. Other rows keep theirs behind Manage. */
  featured?: boolean;
  agentAction?: "cancel" | "reschedule" | null;
  onAgentActionDone?: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [managing, setManaging] = useState(false);
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
          "flex items-start gap-4 sm:gap-6",
          featured ? "rounded-2xl border border-border bg-surface p-5 shadow-xs" : "py-3.5",
        )}
      >
        <CardTime booking={b} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardHeading booking={b} inactive={inactive} />
          <CardFacts booking={b} inactive={inactive} />
          {awaitingPayment && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-warning-soft-foreground">
              <Hourglass className="size-3.5" aria-hidden />
              Held for <span className="tnum font-medium">{formatCountdown(remaining)}</span>. Pay now to
              confirm it.
            </p>
          )}
          {!inactive && (featured || managing || awaitingPayment) && (
            <CardActions
              booking={b}
              awaitingPayment={awaitingPayment}
              onReschedule={() => setRescheduleOpen(true)}
              onCancel={() => setCancelOpen(true)}
            />
          )}
        </div>
        {/* One clear step, beside the booking it belongs to, on a row of its own only once it's open. */}
        {inactive ? (
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href={`/${b.business.slug}`}>Book again</Link>
          </Button>
        ) : (
          !featured &&
          !managing &&
          !awaitingPayment && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              aria-expanded={false}
              onClick={() => setManaging(true)}
            >
              Manage
            </Button>
          )
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

/** The time, the first thing looked for: in the business's zone, and named when that isn't the visitor's own. */
function CardTime({ booking: b }: { booking: CustomerBooking }) {
  const [elsewhere, setElsewhere] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only check after hydration
    setElsewhere(Intl.DateTimeFormat().resolvedOptions().timeZone !== b.timezone);
  }, [b.timezone]);
  return (
    <div className="tnum flex w-14 shrink-0 flex-col sm:w-16">
      <span className="text-base font-semibold tracking-tight">{formatTime(b.start, b.timezone)}</span>
      {elsewhere && <span className="text-xs text-muted-foreground">{timeZoneLabel(b.timezone)}</span>}
      <span className="text-xs text-muted-foreground">{formatDuration(bookingMinutes(b))}</span>
    </div>
  );
}

/** The service and its status; the payment too, unless the booking is over and it no longer applies. */
function CardHeading({ booking: b, inactive }: { booking: CustomerBooking; inactive: boolean }) {
  // Paid and confirmed are the normal case: a row only speaks up about something else.
  const payment =
    showsPaymentStatus(b) &&
    !(b.paymentStatus === "paid" && balanceDueCents(b) === null) &&
    !(inactive && b.paymentStatus === "pay_at_venue");
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <h3 className="text-base font-semibold tracking-tight">
        {b.service.name}
        {b.option && <span className="font-normal text-muted-foreground"> · {b.option.name}</span>}
      </h3>
      <span className="flex flex-wrap gap-1.5">
        <BookingExceptions status={b.status} />
        {payment && <CustomerPaymentBadge booking={b} />}
      </span>
    </div>
  );
}

/** Where and with whom, and what is left to pay at the appointment after a deposit (not once it's over). */
function CardFacts({ booking: b, inactive }: { booking: CustomerBooking; inactive: boolean }) {
  const place = shortAddress(b.business.address);
  const people = b.resources.map((r) => r.name).join(" · ");
  const balance = inactive ? null : balanceDueCents(b);
  // A room or a piece of equipment isn't a person.
  const WithIcon = b.resources.some((r) => r.kind === "person") ? UserRound : DoorOpen;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li>
        <Link
          href={`/${b.business.slug}`}
          className={cn("inline-flex min-w-0 items-center gap-2 hover:text-foreground", touchHitArea)}
        >
          <BusinessTile
            name={b.business.name}
            logoUrl={b.business.branding.logoUrl}
            color={b.business.branding.primaryColor}
            size="sm"
          />
          <span className="truncate">{b.business.name}</span>
        </Link>
      </li>
      {people && (
        <li className="flex items-center gap-1.5">
          <WithIcon className="size-3.5" aria-hidden /> {people}
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
    <>
      {accepted && !b.canCancel && !b.canReschedule && (
        <p className="text-xs text-muted-foreground">
          This one can&rsquo;t be changed online. Contact {b.business.name} if your plans change.
        </p>
      )}
      <div className="mt-1 -ml-2.5 flex flex-wrap items-center gap-1">
        {awaitingPayment && (
          <Button variant="primary" size="sm" loading={pay.isPending} onClick={onPay}>
            <CreditCard /> Pay now{due > 0 ? ` · ${formatMoney(due, b.currency)}` : ""}
          </Button>
        )}
        {b.status !== "held" && <AddToCalendar booking={b} variant="ghost" size="sm" />}
        {b.canReschedule && (
          <Button variant="ghost" size="sm" onClick={onReschedule}>
            Reschedule
          </Button>
        )}
        {b.canCancel && (
          <Button variant="danger-ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </>
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
