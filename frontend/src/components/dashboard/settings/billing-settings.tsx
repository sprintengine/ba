"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { BillingPrice, Plan } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useBilling, useBillingCheckout, useBillingPortal } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { AiUsageCard } from "./ai-usage-card";
import { currentPageUrl, SettingGroup, SettingRow, SettingsHeader, settingsStack } from "./settings-common";

const FALLBACK_PRICES: BillingPrice[] = [
  {
    plan: "free",
    name: "Free",
    amountCents: 0,
    currency: "EUR",
    interval: "month",
    features: ["100 bookings a month", "Up to 3 team members", "“Powered by bookanything” badge"],
  },
  {
    plan: "pro",
    name: "Pro",
    amountCents: 1200,
    currency: "EUR",
    interval: "month",
    features: ["1,000 bookings a month", "Unlimited team", "Remove the badge", "SMS reminders at cost"],
  },
  {
    plan: "business",
    name: "Business",
    amountCents: 3900,
    currency: "EUR",
    interval: "month",
    features: ["Everything in Pro", "Priority support", "AI receptionist (soon)"],
  },
];

/** Subscription statuses the backend treats as a live subscription. */
const LIVE_STATUSES = ["active", "trialing", "past_due"];

export function BillingSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const billing = useBilling(business.id, { enabled: perms.manageBilling });
  const checkout = useBillingCheckout(business.id);
  const portal = useBillingPortal(business.id);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const b = billing.data;
  const prices = b?.prices.length ? b.prices : FALLBACK_PRICES;
  const order: Plan[] = ["free", "pro", "business"];
  const sorted = [...prices].sort((x, y) => order.indexOf(x.plan) - order.indexOf(y.plan));
  const others = sorted.filter((p) => p.plan !== billing.data?.plan);
  // A live subscription changes plan in Stripe's portal: the backend refuses a second checkout (BillingRoutes).
  const subscribed = !!b && b.plan !== "free" && LIVE_STATUSES.includes(b.status);
  const openPortal = () => go(() => portal.mutateAsync({ returnUrl: currentPageUrl() }));

  const go = async (fn: () => Promise<{ url: string }>) => {
    try {
      const { url } = await fn();
      window.location.assign(url);
    } catch (err) {
      if (isApiError(err) && err.code === "PAYMENTS_NOT_CONFIGURED") setNotConfigured(err.message);
      else toast.error(errorMessage(err));
    }
  };

  if (!perms.manageBilling) {
    return (
      <>
        <SettingsHeader segment="billing" />
        <SettingGroup title="Your plan">
          <SettingRow
            label="Only owners manage billing"
            help="Ask an owner of this business to change the plan or see invoices. You're an admin, so you can manage everything else in Settings."
          />
        </SettingGroup>
      </>
    );
  }

  return (
    <>
      <SettingsHeader segment="billing" />
      {billing.isError ? (
        <ErrorState error={billing.error} onRetry={() => billing.refetch()} />
      ) : billing.isPending ? (
        <div className={settingsStack}>
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className={settingsStack}>
          <SettingGroup title="Your plan">
            <SettingRow
              action
              label={
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    Current plan: <span className="capitalize">{b!.plan}</span>
                  </span>
                  {b!.status && b!.status !== "active" && (
                    <Badge tone="warning" className="capitalize">
                      {b!.status.replace(/_/g, " ")}
                    </Badge>
                  )}
                </span>
              }
              help={
                b!.plan === "free"
                  ? "Free forever for small businesses."
                  : "Thanks for supporting bookanything."
              }
            >
              {b!.plan !== "free" ? (
                <Button variant="secondary" loading={portal.isPending} onClick={() => void openPortal()}>
                  Manage subscription and invoices
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <a href="#plans">See plans</a>
                </Button>
              )}
            </SettingRow>
            <SettingRow stacked>
              {b!.usage.limit !== null ? (
                <UsageMeter
                  used={b!.usage.bookingsThisMonth}
                  limit={b!.usage.limit}
                  label={`${v("bookings", { title: true })} this month`}
                />
              ) : (
                <p className="tnum text-sm text-muted-foreground">
                  {b!.usage.bookingsThisMonth} {v("booking", { count: b!.usage.bookingsThisMonth })} this
                  month · unlimited
                </p>
              )}
            </SettingRow>
          </SettingGroup>

          <AiUsageCard />

          {notConfigured && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-warning-border bg-warning-soft px-4.5 py-3 text-sm text-warning-soft-foreground"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-medium">
                  Plan changes aren&apos;t available on this server yet.
                </strong>{" "}
                {notConfigured}
              </span>
            </div>
          )}

          {/* The plan you're on is the group above; these are the ones to move to. */}
          <SettingGroup
            id="plans"
            title="Other plans"
            className="scroll-mt-20"
            note="Prices exclude VAT. One price per business, however many people work there. Cancel any time."
          >
            <div className="grid divide-y divide-border-subtle @lg/settings:grid-cols-2 @lg/settings:divide-x @lg/settings:divide-y-0">
              {others.map((p) => (
                <div key={p.plan} className="flex flex-col gap-4 p-4.5">
                  <span className="text-sm font-semibold">{p.name ?? p.plan}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="tnum text-3xl font-semibold tracking-tight">
                      {formatMoney(p.amountCents, p.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">/ {p.interval}</span>
                  </div>
                  <ul className="flex flex-1 flex-col gap-2">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                      </li>
                    ))}
                  </ul>
                  {p.plan !== "free" && (
                    <Button
                      variant="secondary"
                      loading={
                        subscribed
                          ? portal.isPending
                          : checkout.isPending && checkout.variables.plan === p.plan
                      }
                      onClick={() =>
                        subscribed
                          ? void openPortal()
                          : void go(() =>
                              checkout.mutateAsync({
                                plan: p.plan as "pro" | "business",
                                returnUrl: currentPageUrl(),
                              }),
                            )
                      }
                    >
                      {b!.plan === "free"
                        ? `Upgrade to ${p.name ?? p.plan}`
                        : `Switch to ${p.name ?? p.plan}`}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </SettingGroup>
        </div>
      )}
    </>
  );
}

function UsageMeter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-medium">
          {used} / {limit}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-brand",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct >= 70 && (
        <p className="text-xs text-muted-foreground">
          {pct >= 100
            ? "Limit reached. New online bookings are paused until next month or an upgrade."
            : "You're getting close to the free limit."}
        </p>
      )}
    </div>
  );
}
