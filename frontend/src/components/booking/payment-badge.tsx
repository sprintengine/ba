import type { CustomerBooking } from "@/lib/api/types";
import { balanceDueCents } from "@/lib/booking/booking";
import { Badge } from "@/components/ui/badge";
import { PaymentStatusBadge } from "@/components/ui/status-badge";

/**
 * The payment badge on the customer's own booking: "Deposit paid" while the rest is due at the appointment
 * (the payment status alone says "Paid"), else the payment status.
 */
export function CustomerPaymentBadge({
  booking,
}: {
  booking: Pick<CustomerBooking, "paymentStatus" | "depositCents" | "priceCents" | "amountPaidCents">;
}) {
  if (balanceDueCents(booking) !== null) {
    return (
      <Badge tone="success" title="The deposit is paid; the rest is due at your appointment.">
        Deposit paid
      </Badge>
    );
  }
  return <PaymentStatusBadge status={booking.paymentStatus} />;
}
