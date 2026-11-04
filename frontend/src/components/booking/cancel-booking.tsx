"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import type { CustomerBooking } from "@/lib/api/types";
import { refundCopy } from "@/lib/booking/copy";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/**
 * The customer's "Cancel your booking?" confirmation, shared by the manage page and My bookings: shows what
 * would be refunded, takes an optional reason, runs `cancel` and closes with a toast, or shows the error.
 */
export function CancelBookingDialog({
  booking,
  bookingNoun = "booking",
  open,
  onOpenChange,
  cancel,
  successMessage,
  themeProps,
}: {
  booking: CustomerBooking;
  bookingNoun?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cancels the booking with the customer's reason (null when blank). */
  cancel: (reason: string | null) => Promise<unknown>;
  successMessage: string;
  /** The business's theme, where the page around it has one (`shellThemeProps`). */
  themeProps?: React.ComponentProps<typeof ConfirmDialog>["themeProps"];
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A fresh attempt starts without the last one's error.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError(null);
  }
  const paid = booking.amountPaidCents - booking.amountRefundedCents > 0;

  const confirm = async () => {
    setError(null);
    setPending(true);
    try {
      await cancel(reason.trim() || null);
      onOpenChange(false);
      toast.success(successMessage);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
      }}
      title={`Cancel your ${bookingNoun}?`}
      description={`${booking.service.name} on ${formatDateTime(booking.start, booking.timezone)} with ${booking.business.name}. This can't be undone.`}
      confirmLabel={`Cancel ${bookingNoun}`}
      cancelLabel={`Keep ${bookingNoun}`}
      destructive
      loading={pending}
      onConfirm={confirm}
      themeProps={themeProps}
    >
      <div className="flex flex-col gap-4">
        <div
          className={
            paid
              ? "rounded-lg border border-border bg-surface-sunken px-3.5 py-3 text-sm"
              : "text-sm text-muted-foreground"
          }
        >
          {refundCopy(booking)}
        </div>
        <Field label="Reason" optional help={`Shared with ${booking.business.name}.`}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Something came up…"
          />
        </Field>
        {error && (
          <p role="alert" className="flex gap-2 text-sm text-danger-soft-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
