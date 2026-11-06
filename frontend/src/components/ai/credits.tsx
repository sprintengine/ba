"use client";

import Link from "next/link";
import { AiIcon } from "@/components/brand/logo";
import type { AiCredits } from "@/lib/api/types";
import { creditsPercent, creditsTone, formatCredits } from "@/lib/ai/credits";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dashboardHref } from "@/components/shells/dashboard-nav";

const TONE_BAR = { ok: "bg-brand", low: "bg-warning", out: "bg-danger" } as const;

/** The credits bar: "42 of 200 used" with a meter (tone follows how much is left). */
export function CreditsMeter({
  credits,
  label = "AI credits this month",
  className,
}: {
  credits: AiCredits;
  label?: string;
  className?: string;
}) {
  const business = useCurrentBusiness();
  const tone = creditsTone(credits);
  const pct = creditsPercent(credits);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-medium">
          {formatCredits(credits.used, business.locale)} / {formatCredits(credits.limit, business.locale)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={credits.limit}
        aria-valuenow={Math.min(credits.used, credits.limit)}
        aria-valuetext={`${formatCredits(credits.remaining, business.locale)} credits left`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCredits(credits.remaining, business.locale)} left · resets{" "}
        {formatDate(credits.resetsOn, business.timezone, "dayMonth", business.locale)}
        {credits.overage && " · usage past the allowance is billed"}
      </p>
    </div>
  );
}

/**
 * The inline "running low" / "used up" notice for AI surfaces (Bo, the site builder). Renders nothing while there
 * are plenty of credits. Owners get a link to their usage and plans.
 */
export function CreditsNotice({ credits, className }: { credits: AiCredits; className?: string }) {
  const business = useCurrentBusiness();
  const { manageBilling } = usePermissions();
  const tone = creditsTone(credits);
  if (tone === "ok") return null;
  const resets = formatDate(credits.resetsOn, business.timezone, "dayMonth", business.locale);
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
        tone === "out"
          ? "border-danger-border bg-danger-soft text-danger-soft-foreground"
          : "border-warning-border bg-warning-soft text-warning-soft-foreground",
        className,
      )}
    >
      <AiIcon className="mt-1 shrink-0" />
      <p className="flex-1">
        {tone === "out" ? (
          <>
            <strong className="font-medium">This month&apos;s AI credits are used up.</strong> They reset on{" "}
            {resets}.
          </>
        ) : (
          <>
            <strong className="font-medium">Running low on AI credits:</strong>{" "}
            {formatCredits(credits.remaining, business.locale)} left until {resets}.
          </>
        )}{" "}
        {manageBilling && (
          <Link
            href={dashboardHref(business.slug, "settings/billing")}
            className="font-medium underline underline-offset-2"
          >
            {tone === "out" ? "See plans" : "See usage"}
          </Link>
        )}
      </p>
    </div>
  );
}
