"use client";

import { useFormContext, useWatch } from "react-hook-form";
import type { Service } from "@/lib/api/types";
import { quote } from "@/lib/booking/quote";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { formatDuration } from "@/lib/format";
import { DealPrice } from "@/components/offers/deal-price";
import { useFmt } from "../common";

/** Under the title: the date, any time so far and who with, and whose clock the times are on. */
export function Context({ resources }: { resources: { id: string; name: string }[] }) {
  const fmt = useFmt();
  const business = useCurrentBusiness();
  const form = useFormContext<Values>();
  const [date, timeMode, slotStart, exactTime, withResource] = useWatch({
    control: form.control,
    name: ["date", "timeMode", "slotStart", "exactTime", "withResource"],
  });
  const time = timeMode === "slots" ? (slotStart ? fmt.time(slotStart) : null) : exactTime || null;
  const who = resources.find((r) => r.id === withResource)?.name;
  const city = business.timezone.split("/").at(-1)?.replace(/_/g, " ");
  return (
    <>
      {fmt.date(date, "dayMonth")}
      {time && `, ${time}`}
      {who && ` with ${who}`} · {city} time
    </>
  );
}

/** Footer summary: when, how long and the price (the deal price when the chosen time has a deal). */
export function Summary({ service }: { service: Service | undefined }) {
  const fmt = useFmt();
  const form = useFormContext<Values>();
  const [optionId, addonIds, timeMode, slotStart, slotOffer, date, exactTime] = useWatch({
    control: form.control,
    name: ["optionId", "addonIds", "timeMode", "slotStart", "slotOffer", "date", "exactTime"],
  });
  if (!service) return <span className="text-sm text-subtle-foreground">Nothing selected yet</span>;
  // Same arithmetic as the booking flow: the option's price and length (or the service's), plus add-ons.
  const { durationMinutes: minutes, totalCents: price } = quote(service, optionId, addonIds);
  const deal = timeMode === "slots" && slotStart ? slotOffer : null;
  const when =
    timeMode === "slots"
      ? slotStart
        ? `${fmt.date(slotStart, "dayMonth")}, ${fmt.time(slotStart)}`
        : null
      : exactTime
        ? `${fmt.date(date, "dayMonth")}, ${exactTime}`
        : null;
  return (
    <span className="min-w-0 truncate text-sm">
      <span className="font-medium">{when ?? "No time yet"}</span>
      <span className="text-muted-foreground">
        {" "}
        · {formatDuration(minutes)} ·{" "}
        {deal ? (
          <DealPrice
            originalCents={deal.originalPriceCents}
            priceCents={deal.priceCents}
            currency={fmt.currency}
            locale={fmt.locale}
            className="inline"
          />
        ) : (
          fmt.price(price)
        )}
      </span>
    </span>
  );
}
