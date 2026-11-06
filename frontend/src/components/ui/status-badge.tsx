import type { BookingStatus, PaymentStatus } from "@/lib/api/types";
import { balanceDueCents } from "@/lib/booking/booking";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { Badge } from "./badge";

/** The normal outcomes. A list says nothing about these, so what does need a person stands out. */
const QUIET_BOOKING: readonly BookingStatus[] = ["confirmed", "completed"];
const QUIET_PAYMENT: readonly PaymentStatus[] = ["not_required", "paid"];

type MoneyOnBooking = Parameters<typeof balanceDueCents>[0];

/** Only what's out of the ordinary about a booking: nothing at all when it's confirmed and paid in full. */
export function BookingExceptions({
  status,
  payment,
  booking,
  className,
}: {
  status: BookingStatus;
  payment?: PaymentStatus;
  /** Its money, so a deposit with the rest still to take isn't read as paid. */
  booking?: MoneyOnBooking;
  className?: string;
}) {
  const deposit = booking !== undefined && balanceDueCents(booking) !== null;
  return (
    <>
      {!QUIET_BOOKING.includes(status) && <BookingStatusBadge status={status} className={className} />}
      {deposit && <DepositPaidBadge className={className} />}
      {!deposit && payment && !QUIET_PAYMENT.includes(payment) && (
        <PaymentStatusBadge status={payment} className={className} />
      )}
    </>
  );
}

/** A booking's payment as a badge: "Deposit paid" while the rest is due, never "Paid" over a balance. Free says nothing. */
export function BookingPaymentBadge({ booking, className }: { booking: MoneyOnBooking; className?: string }) {
  if (booking.paymentStatus === "not_required") return null;
  if (balanceDueCents(booking) !== null) return <DepositPaidBadge className={className} />;
  return <PaymentStatusBadge status={booking.paymentStatus} className={className} />;
}

function DepositPaidBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="neutral"
      className={className}
      title="The deposit is paid; the rest is due at the appointment."
    >
      Deposit paid
    </Badge>
  );
}

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const meta = BOOKING_STATUS[status];
  return (
    <Badge tone={meta.tone} dot className={className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS[status];
  return (
    <Badge tone={meta.tone} className={className} title={meta.description}>
      {meta.label}
    </Badge>
  );
}
