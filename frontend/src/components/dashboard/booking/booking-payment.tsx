"use client";

import { HandCoins } from "lucide-react";
import type { BookingDetail } from "@/lib/api/types";
import { useMarkPaidInPerson } from "@/lib/api/hooks";
import { balanceDueCents } from "@/lib/booking/booking";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { canMarkPaidInPerson } from "@/lib/dashboard/booking-capabilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { withToast } from "@/components/common/with-toast";
import { DealLine, DealPrice } from "@/components/offers/deal-price";
import { PanelSection, useFmt } from "../common";
import { amountDue } from "@/lib/dashboard/booking-copy";

/** Price (with any deal), deposit, paid, refunded and what is still due, then each payment. Due at the venue: mark it paid. */
export function PaymentSection({ booking: b }: { booking: BookingDetail }) {
  const fmt = useFmt();
  const due = amountDue(b);
  // The booking's own currency: it was priced in it, whatever the business's currency is now.
  const money = (cents: number) => fmt.money(cents, { currency: b.currency });
  const hasDeposit = b.depositCents !== null && b.depositCents > 0;
  const hasDue = due > 0 && b.paymentStatus !== "not_required";
  const canMarkPaid = canMarkPaidInPerson(b) && due > 0;
  // Just a price needs no heading or card round it.
  if (
    !hasDeposit &&
    !hasDue &&
    !canMarkPaid &&
    !b.amountPaidCents &&
    !b.amountRefundedCents &&
    !b.payments.length
  ) {
    return (
      <dl className="text-sm">
        <PriceRow booking={b} />
      </dl>
    );
  }
  return (
    <PanelSection title="Payment">
      <dl className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle text-sm">
        <PriceRow booking={b} />
        {hasDeposit && <MoneyRow label="Deposit" value={money(b.depositCents ?? 0)} />}
        {b.amountPaidCents > 0 && <MoneyRow label="Paid" value={money(b.amountPaidCents)} />}
        {b.amountRefundedCents > 0 && (
          <MoneyRow label="Refunded" value={`−${money(b.amountRefundedCents)}`} />
        )}
        {hasDue && (
          <MoneyRow
            label={
              b.paymentStatus === "pay_at_venue" || balanceDueCents(b) !== null
                ? "Due at venue"
                : "Outstanding"
            }
            value={money(due)}
            strong
          />
        )}
      </dl>
      {canMarkPaid && <MarkPaidInPerson booking={b} amount={money(due)} />}
      {b.payments.length > 0 && <PaymentList payments={b.payments} />}
    </PanelSection>
  );
}

/** The price; struck through with the deal price when a deal applied. */
function PriceRow({ booking: b }: { booking: BookingDetail }) {
  const fmt = useFmt();
  if (!b.offer || b.originalPriceCents == null || b.originalPriceCents <= b.priceCents) {
    return <MoneyRow label="Price" value={fmt.price(b.priceCents, b.currency)} />;
  }
  return (
    <>
      <DealLine deal={b.offer} currency={b.currency} locale={fmt.locale} className="py-2" />
      <MoneyRow
        label="Price"
        value={
          <DealPrice
            originalCents={b.originalPriceCents}
            priceCents={b.priceCents}
            currency={b.currency}
            locale={fmt.locale}
          />
        }
      />
    </>
  );
}

/** Record that what is due at the venue was paid there (confirmed first: a recorded payment can't be undone). */
function MarkPaidInPerson({ booking, amount }: { booking: BookingDetail; amount: string }) {
  const business = useCurrentBusiness();
  const mark = useMarkPaidInPerson(business.id);
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="secondary" className="self-start">
          <HandCoins /> Mark as paid in person
        </Button>
      }
      title={`Mark ${amount} as paid in person?`}
      description="Records that this was paid at the venue. It counts in your reports and can't be refunded online."
      confirmLabel="Mark as paid"
      loading={mark.isPending}
      onConfirm={async () => {
        await withToast(() => mark.mutateAsync(booking.id), `${amount} marked as paid in person`);
      }}
    />
  );
}

/** How a payment was made: the provider, or in person at the venue. */
function providerLabel(provider: string) {
  if (provider === "dev") return "test payment";
  if (provider === "in_person") return "in person";
  if (provider === "stripe") return "Stripe";
  return provider;
}

function PaymentList({ payments }: { payments: BookingDetail["payments"] }) {
  const fmt = useFmt();
  return (
    <ul className="flex flex-col gap-1.5">
      {payments.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5 rounded-full",
                p.status === "succeeded"
                  ? "bg-success"
                  : p.status === "failed"
                    ? "bg-danger"
                    : "bg-subtle-foreground",
              )}
            />
            {p.kind === "refund" ? "Refund" : "Charge"} · {providerLabel(p.provider)} · {p.status}
          </span>
          <span className="tnum">
            {p.kind === "refund" ? "−" : ""}
            {fmt.money(p.amountCents, { currency: p.currency })} · {fmt.day(p.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tnum", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}
