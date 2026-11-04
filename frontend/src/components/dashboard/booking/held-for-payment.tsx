"use client";

import { copyText } from "@/lib/utils";
import { Copy, Link2, Timer } from "lucide-react";
import type { CreatedBooking } from "@/lib/api/types";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useFmt } from "../common";

/** Success state for a booking that waits for online payment: the link to share. */
export function HeldForPayment({
  booking,
  checkoutUrl,
  emailed,
  onView,
  onDone,
}: {
  booking: CreatedBooking;
  checkoutUrl: string;
  emailed: boolean;
  onView?: () => void;
  onDone: () => void;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const copy = async () => {
    if (await copyText(checkoutUrl)) toast.success("Payment link copied");
    else toast.error("Couldn't copy. Select the link and copy it instead.");
  };
  return (
    <>
      <SheetHeader>
        <SheetTitle>{v("booking", { title: true })} held for payment</SheetTitle>
        <SheetDescription>
          {booking.customer.name} · {booking.service.name} · {fmt.date(booking.start, "dayMonth")},{" "}
          {fmt.time(booking.start)}
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {booking.holdExpiresAt && (
          <p className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-sm text-warning-soft-foreground">
            <Timer className="mt-0.5 size-4 shrink-0" aria-hidden />
            The time is held until {fmt.time(booking.holdExpiresAt)}. It&apos;s confirmed as soon as the{" "}
            {v("customer")} pays
            {booking.depositCents
              ? ` the ${fmt.money(booking.depositCents, { currency: booking.currency })} deposit`
              : ` ${fmt.money(booking.priceCents, { currency: booking.currency })}`}
            ; after that the time is released.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-subtle-foreground" aria-hidden /> Payment link
          </span>
          <Input
            readOnly
            aria-label="Payment link"
            value={checkoutUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground">
            {emailed
              ? `We've emailed this link to ${booking.customer.email}. You can also copy it and send it another way.`
              : `Copy the link and send it to the ${v("customer")} by text or email.`}
          </p>
          <div>
            <Button variant="secondary" onClick={copy}>
              <Copy /> Copy payment link
            </Button>
          </div>
        </div>
      </div>
      <SheetFooter className="justify-end gap-2">
        {onView && (
          <Button variant="secondary" onClick={onView}>
            View {v("booking")}
          </Button>
        )}
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </SheetFooter>
    </>
  );
}
