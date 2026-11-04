import type { BookingStatus, PaymentStatus } from "@/lib/api/types";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { Badge } from "./badge";

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
