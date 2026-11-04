"use client";

import { useState } from "react";
import { CircleAlert, CreditCard, FlaskConical, Lock } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useCompleteDevPayment, useDevPayment } from "@/lib/api/hooks";
import type { DevPaymentOutcome } from "@/lib/api/types";
import { formatDate, formatMoney, formatTimeRange } from "@/lib/format";
import { formatCountdown } from "@/lib/booking/copy";
import { useCountdown } from "@/lib/hooks/use-now";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { ErrorState } from "@/components/common/feedback";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Simulated hosted checkout for the development payment provider (architecture §7).
 * Looks like a real checkout so the flow can be exercised end to end, but is
 * unmistakably labelled as a test and never touches real money.
 */
export function DevCheckout({ paymentId }: { paymentId: string }) {
  const info = useDevPayment(paymentId, { retry: false });
  const complete = useCompleteDevPayment(paymentId);
  const [submitting, setSubmitting] = useState<DevPaymentOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = useCountdown(
    info.data?.booking.status === "held" ? info.data.booking.holdExpiresAt : null,
  );

  const finish = async (outcome: DevPaymentOutcome) => {
    setError(null);
    setSubmitting(outcome);
    try {
      const { redirectUrl } = await complete.mutateAsync(outcome);
      window.location.assign(redirectUrl);
    } catch (err) {
      setSubmitting(null);
      setError(errorMessage(err));
    }
  };

  const banner = (
    <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning-soft-foreground">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      Development payment — no real money is charged
    </div>
  );

  if (info.isError) {
    return (
      <div className="min-h-dvh bg-background">
        {banner}
        {info.error.isNotFound ? (
          <EmptyState
            size="lg"
            icon={<CreditCard />}
            title="Payment not found"
            description="This test payment doesn't exist, or development payments are turned off on this server."
          />
        ) : (
          <ErrorState error={info.error} onRetry={() => info.refetch()} />
        )}
      </div>
    );
  }
  if (!info.data) {
    return (
      <div className="min-h-dvh bg-background">
        {banner}
        <div
          className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2"
          role="status"
          aria-busy
          aria-label="Loading"
        >
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-12 w-56" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { payment, booking, business } = info.data;
  const tz = booking.timezone;
  const amount = formatMoney(payment.amountCents, payment.currency, { exact: true });
  const pending = payment.status === "pending" && booking.status === "held";
  const expired = remaining === 0;

  return (
    <BusinessThemeProvider primaryColor={business.branding.primaryColor} className="min-h-dvh bg-background">
      {banner}
      <div className="mx-auto grid max-w-5xl md:min-h-[calc(100dvh-2rem)] md:grid-cols-2">
        {/* Order summary */}
        <section className="flex flex-col gap-8 px-6 py-10 md:py-20 md:pr-12">
          <div className="flex items-center gap-3">
            <BusinessTile
              name={business.name}
              logoUrl={business.branding.logoUrl}
              color={business.branding.primaryColor}
            />
            <span className="font-medium">{business.name}</span>
            <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-warning-soft-foreground uppercase">
              Test mode
            </span>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pay {business.name}</p>
            <p className="tnum mt-1 text-4xl font-semibold tracking-tight">{amount}</p>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-border pt-6 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {booking.service.name}
                {booking.option && <span className="text-muted-foreground"> · {booking.option.name}</span>}
              </p>
              <p className="tnum text-muted-foreground">
                {formatDate(booking.start, tz, "dayMonthYear")} ·{" "}
                {formatTimeRange(booking.start, booking.end, tz)}
              </p>
              <p className="text-muted-foreground">Ref {booking.reference}</p>
            </div>
            <span className="tnum shrink-0 font-medium">{amount}</span>
          </div>
          {pending && remaining !== null && remaining > 0 && (
            <p className="text-sm text-muted-foreground">
              Your time is held for{" "}
              <span className="tnum font-medium text-foreground">{formatCountdown(remaining)}</span>.
            </p>
          )}
        </section>

        {/* Payment form */}
        <section className="flex flex-col gap-6 border-border bg-surface px-6 py-10 shadow-sm md:border-l md:py-20 md:pl-12 dark:bg-surface-raised">
          {!pending || expired ? (
            <div className="flex flex-col gap-3">
              <h1 className="text-lg font-semibold">
                {payment.status === "succeeded"
                  ? "This payment is complete"
                  : expired || booking.status === "expired"
                    ? "This checkout has expired"
                    : "This checkout is closed"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {payment.status === "succeeded"
                  ? "Nothing more to do — check your email for the confirmation."
                  : "Start a new booking from the business's booking page."}
              </p>
              <Button asChild variant="secondary" className="w-fit">
                <a href={`/${business.slug}`}>Back to {business.name}</a>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Pay with card</h1>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Email
                  <Input readOnly value={booking.customer.email ?? ""} size="lg" />
                </label>
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  Card information
                  <div className="overflow-hidden rounded-lg border border-input shadow-xs">
                    <div className="flex items-center gap-2 border-b border-input bg-surface px-3.5 py-2.5 text-base text-muted-foreground dark:bg-surface-sunken">
                      <CreditCard className="size-4" aria-hidden /> 4242 4242 4242 4242
                    </div>
                    <div className="grid grid-cols-2 bg-surface text-base text-muted-foreground dark:bg-surface-sunken">
                      <span className="border-r border-input px-3.5 py-2.5">12 / 34</span>
                      <span className="px-3.5 py-2.5">123</span>
                    </div>
                  </div>
                  <span className="text-xs font-normal text-muted-foreground">
                    Test card — nothing to fill in.
                  </span>
                </div>
              </div>
              {error && (
                <p role="alert" className="flex gap-2 text-sm text-danger-soft-foreground">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="xl"
                  block
                  loading={submitting === "succeeded"}
                  disabled={submitting !== null}
                  onClick={() => finish("succeeded")}
                >
                  <Lock /> Pay {amount}
                </Button>
                <Button
                  variant="ghost"
                  block
                  loading={submitting === "cancelled"}
                  disabled={submitting !== null}
                  onClick={() => finish("cancelled")}
                >
                  Cancel and return
                </Button>
              </div>
              <p className="text-center text-xs text-subtle-foreground">
                Simulates the payment provider for local development. In production this is Stripe Checkout,
                and payments go straight to {business.name}.
              </p>
            </>
          )}
        </section>
      </div>
    </BusinessThemeProvider>
  );
}
