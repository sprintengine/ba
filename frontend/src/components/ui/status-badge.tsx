import type { BookingStatus, PaymentStatus } from "@/lib/api/types";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { Badge } from "./badge";

/** The normal outcomes. A list says nothing about these, so what does need a person stands out. */
const QUIET_BOOKING: readonly BookingStatus[] = ["confirmed", "completed"];
const QUIET_PAYMENT: readonly PaymentStatus[] = ["not_required", "paid"];

/** Only what's out of the ordinary about a booking: nothing at all when it's confirmed and paid. */
export function BookingExceptions({
  status,
  payment,
  className,
}: {
  status: BookingStatus;
  payment?: PaymentStatus;
  className?: string;
}) {
  return (
    <>
      {!QUIET_BOOKING.includes(status) && <BookingStatusBadge status={status} className={className} />}
      {payment && !QUIET_PAYMENT.includes(payment) && (
        <PaymentStatusBadge status={payment} className={className} />
      )}
    </>
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
