"use client";

import { CalendarDays, ChevronUp, Clock, Lock, Shield, User, Users, Zap } from "lucide-react";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { formatDate, formatPrice, formatTime, zonedToIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { shellThemeProps } from "@/components/shells/public-booking-shell";
import { cancellationSummary, paymentModeCopy } from "@/lib/booking/copy";
import type { Quote } from "@/lib/booking/quote";
import { chosenExtras, resourceChoiceName, type Selection } from "@/lib/booking/selection";
import type { StepId } from "@/lib/booking/steps";
import { QuoteBreakdown } from "./quote-breakdown";

export type SummaryProps = {
  business: PublicBusiness;
  service: PublicService | null;
  selection: Selection;
  quote: Quote | null;
  onEdit?: (step: StepId) => void;
  /** Any bookable service is paid online (full or deposit). */
  takesOnlinePayment?: boolean;
  /** Steps currently in the flow (only these rows are editable). */
  steps: StepId[];
};

function useRows({ business, service, selection, steps }: SummaryProps) {
  const { v } = useVocabulary();
  const tz = business.timezone;
  const group = business.customerGroups.find((g) => g.id === selection.groupId);
  const { option, addons } = chosenExtras(service, selection);
  const resource = resourceChoiceName(selection, service, v("resource"));

  const rows: { step: StepId; icon: React.ReactNode; label: React.ReactNode; hint?: React.ReactNode }[] = [];
  if (steps.includes("group") && group) rows.push({ step: "group", icon: <Users />, label: group.name });
  if (service)
    rows.push({
      step: "service",
      icon: <Clock />,
      label: (
        <>
          {service.name}
          {option && <span className="text-muted-foreground"> · {option.name}</span>}
        </>
      ),
      hint: addons.length > 0 ? `+ ${addons.map((a) => a.name).join(", ")}` : undefined,
    });
  if (steps.includes("resource") && resource)
    rows.push({ step: "resource", icon: <User />, label: resource });
  if (selection.date && selection.time)
    rows.push({
      step: "time",
      icon: <CalendarDays />,
      label: formatDate(selection.date, tz, "long", business.locale),
      hint: formatTime(zonedToIso(selection.date, selection.time, tz), tz, business.locale),
    });
  return rows;
}

/** Desktop sticky summary card. */
export function BookingSummaryCard(props: SummaryProps) {
  const { business, service, quote, onEdit, steps, takesOnlinePayment } = props;
  const { v } = useVocabulary();
  const rows = useRows(props);
  const locale = business.locale;
  const cur = business.currency;
  return (
    <aside
      aria-label={`Your ${v("booking")}`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:bg-surface-raised"
    >
      <div className="border-b border-border-subtle px-5 py-4">
        <p className="text-xs font-medium text-subtle-foreground">Your {v("booking")}</p>
        <p className="mt-0.5 truncate text-base font-semibold tracking-tight">{business.name}</p>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-sm text-muted-foreground">Choose a service to get started.</p>
          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="flex gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>Live availability, confirmed by email</span>
            </li>
            <li className="flex gap-2.5">
              <Shield className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                {business.policies.allowCustomerCancel
                  ? `Change or cancel online${business.policies.cancellationNoticeHours > 0 ? ` up to ${business.policies.cancellationNoticeHours}h before` : ""}`
                  : "Your details are only shared with " + business.name}
              </span>
            </li>
            {business.paymentsEnabled && takesOnlinePayment && (
              <li className="flex gap-2.5">
                <Lock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>Secure payments, straight to {business.name}</span>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 p-2">
          {rows.map((r) => {
            const editable = !!onEdit && steps.includes(r.step);
            const content = (
              <>
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground [&_svg]:size-3.5">
                  {r.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{r.label}</span>
                  {r.hint && <span className="tnum text-xs text-muted-foreground">{r.hint}</span>}
                </span>
                {editable && (
                  <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
                    Change
                  </span>
                )}
              </>
            );
            return (
              <li key={r.step}>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => onEdit(r.step)}
                    className="group flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 px-3 py-2">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {quote && service && (
        <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface-sunken/60 px-5 py-4">
          <QuoteBreakdown quote={quote} currency={cur} locale={locale} variant="summary" />
          {paymentModeCopy(quote, cur, locale) && (
            <p className="text-xs text-muted-foreground">{paymentModeCopy(quote, cur, locale)}</p>
          )}
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Shield className="mt-px size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
            {cancellationSummary(business.policies, quote.mode, business.name)}
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * Mobile: a sticky bottom bar with the running total and the step's primary
 * action; tapping the summary opens the full breakdown in a drawer.
 */
export function MobileSummaryBar({
  action,
  actionOnly = false,
  className,
  ...props
}: SummaryProps & {
  action?: React.ReactNode;
  /** Full-width action without the summary (e.g. the final confirm step). */
  actionOnly?: boolean;
  className?: string;
}) {
  const { business, service, quote, selection } = props;
  const { v } = useVocabulary();
  if (!service && !action) return null;
  const tz = business.timezone;
  const when =
    selection.date && selection.time
      ? `${formatDate(selection.date, tz, "dayMonth", business.locale)}, ${formatTime(zonedToIso(selection.date, selection.time, tz), tz, business.locale)}`
      : null;
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {actionOnly ? (
          <div className="flex flex-1 flex-col [&>button]:w-full">{action}</div>
        ) : service && quote ? (
          <Drawer>
            <DrawerTrigger asChild>
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Show ${v("booking")} summary`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{service.name}</span>
                  <span className="tnum truncate text-xs text-muted-foreground">
                    {[when, formatPrice(quote.totalCents, business.currency, { locale: business.locale })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronUp className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
              </button>
            </DrawerTrigger>
            {/* In a portal, outside the shell: given its theme, so the summary looks as it does beside the steps. */}
            <DrawerContent {...shellThemeProps(business)}>
              <DrawerTitle className="sr-only">Your {v("booking")}</DrawerTitle>
              <div className="overflow-y-auto p-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <BookingSummaryCard {...props} />
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <span className="flex-1" />
        )}
        {!actionOnly && action}
      </div>
    </div>
  );
}
