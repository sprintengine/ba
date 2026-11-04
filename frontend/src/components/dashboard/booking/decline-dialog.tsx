"use client";

import { useState } from "react";
import type { Booking } from "@/lib/api/types";
import { useDeclineBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { withToast } from "@/components/common/with-toast";
import { useFmt } from "../common";
import { paidInPersonNote, refundableOnline } from "@/lib/dashboard/booking-copy";

/** Decline a pending request, with an optional reason that is quoted in the email to the customer. */
export function DeclineBookingDialog({
  booking,
  open,
  onOpenChange,
  onDeclined,
}: {
  booking: Pick<
    Booking,
    | "id"
    | "start"
    | "customer"
    | "service"
    | "amountPaidCents"
    | "amountPaidInPersonCents"
    | "amountRefundedCents"
    | "currency"
  >;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeclined?: () => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const decline = useDeclineBooking(business.id);
  const [reason, setReason] = useState("");
  const paid = refundableOnline(booking);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!decline.isPending) onOpenChange(o);
      }}
      title={`Decline this ${v("booking")}?`}
      description={`${booking.customer.name} · ${booking.service.name} · ${fmt.date(booking.start, "dayMonth")}, ${fmt.time(booking.start)}. The ${v("customer")} is emailed and the time becomes free.${
        paid > 0 ? ` The ${fmt.money(paid)} they paid online is refunded in full.` : ""
      }${paidInPersonNote(booking)}`}
      confirmLabel="Decline"
      cancelLabel="Keep request"
      destructive
      loading={decline.isPending}
      onConfirm={async () => {
        const declined = await withToast(
          () => decline.mutateAsync({ id: booking.id, reason }),
          `${v("booking", { title: true })} declined`,
        );
        if (!declined) return;
        setReason("");
        onOpenChange(false);
        onDeclined?.();
      }}
    >
      <Field label="Reason" optional help={`Included in the email to the ${v("customer")}.`}>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. We're fully booked that week"
        />
      </Field>
    </ConfirmDialog>
  );
}
