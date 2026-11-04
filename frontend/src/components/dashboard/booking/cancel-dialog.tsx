"use client";

import { useState } from "react";
import { Ban, HandCoins, Undo2 } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/client";
import { useCancelBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useFmt } from "../common";
import { refundableOnline, refundPreview, type RefundChoice } from "@/lib/dashboard/booking-copy";

/** Cancel with a refund choice (policy / full / none) and a notify toggle. */
export function CancelBookingDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const cancel = useCancelBooking(business.id);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<RefundChoice>("policy");
  const [notify, setNotify] = useState(true);
  const paid = refundableOnline(booking) > 0;
  const preview = refundPreview(booking, refund);

  const submit = async () => {
    try {
      await cancel.mutateAsync({
        id: booking.id,
        input: { reason: reason.trim() || null, refund: paid ? refund : "none", notifyCustomer: notify },
      });
      toast.success(
        `${v("booking", { title: true })} cancelled`,
        preview.amountCents > 0 && paid
          ? { description: `${fmt.money(preview.amountCents)} refund on its way.` }
          : undefined,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Cancel this {v("booking")}?</DialogTitle>
          <DialogDescription>
            {booking.customer.name} · {booking.service.name} · {fmt.date(booking.start, "dayMonth")},{" "}
            {fmt.time(booking.start)}. The time becomes free for others straight away.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {paid && (
            <Field label="Refund">
              <RadioCards value={refund} onValueChange={(val) => setRefund(val as RefundChoice)}>
                <RadioCard
                  value="policy"
                  icon={<HandCoins />}
                  title="Follow your policy"
                  description="Business cancellations are refunded in full."
                  aside={fmt.money(refundPreview(booking, "policy").amountCents)}
                />
                <RadioCard
                  value="full"
                  icon={<Undo2 />}
                  title="Full refund"
                  aside={fmt.money(refundPreview(booking, "full").amountCents)}
                />
                <RadioCard
                  value="none"
                  icon={<Ban />}
                  title="No refund"
                  description="Keep what was paid."
                  aside={fmt.money(0)}
                />
              </RadioCards>
            </Field>
          )}
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-muted-foreground">
            {preview.text}
          </p>
          <Field
            label="Reason"
            optional
            help={notify ? `Included in the email to the ${v("customer")}.` : "Kept in the history."}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. We have to close early today"
            />
          </Field>
          <Field
            orientation="horizontal"
            label={`Email the ${v("customer")}`}
            help={
              paid ? "Sends a cancellation email with the refund details." : "Sends a cancellation email."
            }
          >
            <Switch checked={notify} onCheckedChange={setNotify} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep {v("booking")}
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={submit}>
            Cancel {v("booking")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
