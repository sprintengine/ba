"use client";

import { CreditCard, Lock } from "lucide-react";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { formatDate, formatMoney, formatTimeRange, zonedToIso, type PlainDate } from "@/lib/format";
import { bookingEnd } from "@/lib/booking/booking";
import { cn } from "@/lib/utils";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import { useDemoTarget } from "../engine/demo-context";
import { LUMEN } from "./fixture";

/*
 * The hosted payment page. In production the flow hands over to Stripe Checkout; locally it's the app's
 * stand-in (components/booking/dev-checkout.tsx), which this follows without its test-mode labels.
 */

const TZ = LUMEN.timezone;
const AMOUNT = formatMoney(7000, LUMEN.currency, { exact: true });
export const REFERENCE = "BA-7KQ2MX";

function CardField({ filled }: { filled: boolean }) {
  const t = useDemoTarget("card-number");
  const text = filled ? "text-foreground" : "text-subtle-foreground";
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      Card information
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-input shadow-xs transition-[border-color,box-shadow]",
          t.focused && "border-ring ring-3 ring-ring/20",
        )}
      >
        <div
          {...t.props}
          className={cn(
            "flex items-center gap-2 border-b border-input bg-surface px-3.5 py-2.5 text-base font-normal dark:bg-surface-sunken",
            text,
          )}
        >
          <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          {filled ? "4242 4242 4242 4242" : "1234 1234 1234 1234"}
        </div>
        <div className={cn("grid grid-cols-2 bg-surface text-base font-normal dark:bg-surface-sunken", text)}>
          <span className="border-r border-input px-3.5 py-2.5">{filled ? "12 / 29" : "MM / YY"}</span>
          <span className="px-3.5 py-2.5">{filled ? "123" : "CVC"}</span>
        </div>
      </div>
    </div>
  );
}

export function CheckoutScreen({
  date,
  time,
  email,
  cardFilled,
  paying,
}: {
  date: PlainDate;
  time: string;
  email: string;
  cardFilled: boolean;
  paying: boolean;
}) {
  const pay = useDemoTarget("pay");
  const start = zonedToIso(date, time, TZ);
  return (
    <BusinessThemeProvider primaryColor={LUMEN.branding.primaryColor} className="min-h-full bg-background">
      <div className="mx-auto grid max-w-5xl">
        <section className="flex flex-col gap-8 px-6 py-10">
          <div className="flex items-center gap-3">
            <BusinessTile
              name={LUMEN.name}
              logoUrl={LUMEN.branding.logoUrl}
              color={LUMEN.branding.primaryColor}
            />
            <span className="font-medium">{LUMEN.name}</span>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pay {LUMEN.name}</p>
            <p className="tnum mt-1 text-4xl font-semibold tracking-tight">{AMOUNT}</p>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-border pt-6 text-sm">
            <div className="min-w-0">
              <p className="font-medium">Initial assessment</p>
              <p className="tnum text-muted-foreground">
                {formatDate(start, TZ, "dayMonthYear")} · {formatTimeRange(start, bookingEnd(start, 60), TZ)}
              </p>
              <p className="text-muted-foreground">Ref {REFERENCE}</p>
            </div>
            <span className="tnum shrink-0 font-medium">{AMOUNT}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Your time is held for <span className="tnum font-medium text-foreground">29:56</span>.
          </p>
        </section>

        <section className="flex flex-col gap-6 border-border bg-surface px-6 py-10 shadow-sm dark:bg-surface-raised">
          <h2 className="text-lg font-semibold">Pay with card</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <div className="flex h-11 w-full items-center rounded-lg border border-input bg-surface px-3.5 text-base leading-[normal] font-normal shadow-xs dark:bg-surface-sunken">
                {email}
              </div>
            </div>
            <CardField filled={cardFilled} />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              {...pay.props}
              variant="primary"
              size="xl"
              block
              tabIndex={-1}
              loading={paying}
              className={cn(pay.pressed && "scale-[0.98]")}
            >
              <Lock /> Pay {AMOUNT}
            </Button>
            <Button variant="ghost" block tabIndex={-1}>
              Cancel and return
            </Button>
          </div>
          <p className="text-center text-xs text-subtle-foreground">
            Powered by <span className="font-semibold">stripe</span> · Terms · Privacy
          </p>
        </section>
      </div>
    </BusinessThemeProvider>
  );
}
