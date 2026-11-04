"use client";

import { copyText } from "@/lib/utils";
import { Copy, Link2, Mail } from "lucide-react";
import type { BookingDetail } from "@/lib/api/types";
import { useSendPaymentLink } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";

/** Share the checkout link of a held booking: copy it, or email it to the customer again. */
export function PaymentLink({ booking, checkoutUrl }: { booking: BookingDetail; checkoutUrl: string }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const send = useSendPaymentLink(business.id);
  const copy = async () => {
    if (await copyText(checkoutUrl)) toast.success("Payment link copied");
    else toast.error("Couldn't copy. Select the link and copy it instead.");
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3.5 text-sm dark:bg-surface-raised">
      <div className="flex items-center gap-2 font-medium">
        <Link2 className="size-4 text-subtle-foreground" aria-hidden /> Payment link
      </div>
      <p className="text-muted-foreground">
        The {v("customer")} pays online with this link to confirm the {v("booking")}.
      </p>
      <Input
        size="sm"
        readOnly
        aria-label="Payment link"
        value={checkoutUrl}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs text-muted-foreground"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy /> Copy payment link
        </Button>
        {booking.customer.email ? (
          <Button
            size="sm"
            variant="ghost"
            loading={send.isPending}
            onClick={async () => {
              await withToast(
                () => send.mutateAsync(booking.id),
                (sent) => `Payment link sent to ${sent.sentTo}`,
              );
            }}
          >
            <Mail /> Resend payment link
          </Button>
        ) : (
          <span className="self-center text-xs text-subtle-foreground">
            No email address on file, so share the link directly.
          </span>
        )}
      </div>
    </div>
  );
}
