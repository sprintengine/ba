"use client";

import {
  BadgePercent,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FlaskConical,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useConnectPayments, usePaymentsStatus } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { currentPageUrl, SettingsCard, SettingsHeader, StatusLine } from "./settings-common";

export function PaymentsSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const status = usePaymentsStatus(business.id);
  const connect = useConnectPayments(business.id);
  const s = status.data;

  const start = async () => {
    try {
      const { url } = await connect.mutateAsync({ returnUrl: currentPageUrl() });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <SettingsHeader segment="payments" />
      <div className="flex flex-col gap-6">
        {status.isError ? (
          <ErrorState error={status.error} onRetry={() => status.refetch()} />
        ) : status.isPending ? (
          <Skeleton className="h-44 rounded-xl" />
        ) : s!.provider === "none" ? (
          <SettingsCard
            title="Payments aren't available yet"
            description="This server isn't set up to take card payments."
          >
            <StatusLine
              tone="neutral"
              icon={<Plug />}
              title="Not configured"
              text="Services can still be free or paid at the venue. Online payment will appear here once it's switched on for your account."
            />
          </SettingsCard>
        ) : s!.provider === "dev" ? (
          <SettingsCard
            title="Test payments"
            description="You're on a development server. Checkouts use a pretend payment page — no real money moves."
          >
            <StatusLine
              tone="info"
              icon={<FlaskConical />}
              title="Test mode is on"
              text="Try the full flow: book a paid service on your page and you'll see a test checkout where you can succeed or cancel the payment."
            />
          </SettingsCard>
        ) : s!.chargesEnabled ? (
          <SettingsCard
            title="Stripe is connected"
            description="Payments go straight to your Stripe account."
          >
            <StatusLine
              tone="success"
              icon={<CircleCheck />}
              title="Ready to take payments"
              text="Refunds for cancellations are sent automatically, following your booking policies."
            />
            {perms.managePayments && (
              <Button variant="secondary" className="self-start" loading={connect.isPending} onClick={start}>
                Update Stripe details
              </Button>
            )}
          </SettingsCard>
        ) : (
          <SettingsCard
            title="Connect Stripe"
            description="Take deposits and full payments when people book. Stripe handles cards, Apple Pay and Google Pay."
          >
            {s!.connected ? (
              <StatusLine
                tone="warning"
                icon={<CircleAlert />}
                title="Almost there"
                text={
                  s!.detailsSubmitted
                    ? "Stripe is reviewing your details. This usually takes a few minutes."
                    : "Finish your Stripe setup to start taking payments."
                }
              />
            ) : (
              <StatusLine
                tone="neutral"
                icon={<CreditCard />}
                title="Not connected"
                text="Takes about five minutes. You'll need your bank details and ID."
              />
            )}
            {perms.managePayments ? (
              <Button variant="primary" className="self-start" loading={connect.isPending} onClick={start}>
                {s!.connected ? "Continue setup" : "Connect with Stripe"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Only an owner can connect payments.</p>
            )}
          </SettingsCard>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Note
            icon={<BadgePercent />}
            title="0% platform fee"
            text="We never take a cut of your bookings. You only pay Stripe's standard card fees."
          />
          <Note
            icon={<ShieldCheck />}
            title="You're the merchant"
            text="Money goes to your own Stripe account, and your name appears on statements."
          />
        </div>
      </div>
    </>
  );
}

function Note({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface-sunken/60 p-4">
      <span className="text-brand [&_svg]:size-4.5">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
