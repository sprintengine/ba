"use client";

import Link from "next/link";
import { useFormContext, useWatch } from "react-hook-form";
import { AlertTriangle, Banknote, CreditCard, Gift, HandCoins } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { PAYMENT_MODE_LABEL, type ServiceFormValues as V } from "@/lib/services/service-form";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { MoneyInput } from "@/components/ui/money-input";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { SettingFormRow } from "../../settings/setting-rows";
import { Section } from "./section";

export function PricingSection() {
  const business = useCurrentBusiness();
  const form = useFormContext<V>();
  const mode = useWatch({ control: form.control, name: "paymentMode" });
  const online = mode === "full" || mode === "deposit";
  const hasOptions = useWatch({ control: form.control, name: "options" }).length > 0;
  return (
    <Section title="Price and payment" description="bookanything never takes a cut of your payments." rows>
      <SettingFormRow<V, "paymentMode"> stacked name="paymentMode" label="How people pay">
        {(field) => (
          <RadioCards value={field.value} onValueChange={field.onChange} columns={2}>
            <RadioCard
              value="full"
              icon={<CreditCard />}
              title={PAYMENT_MODE_LABEL.full}
              description="Paid when booking. Fewer no-shows."
              className="p-3"
            />
            <RadioCard
              value="deposit"
              icon={<HandCoins />}
              title={PAYMENT_MODE_LABEL.deposit}
              description="Secure the slot, rest on the day."
              className="p-3"
            />
            <RadioCard
              value="at_venue"
              icon={<Banknote />}
              title={PAYMENT_MODE_LABEL.at_venue}
              description="Nothing to pay online."
              className="p-3"
            />
            <RadioCard
              value="free"
              icon={<Gift />}
              title={PAYMENT_MODE_LABEL.free}
              description="No charge at all."
              className="p-3"
            />
          </RadioCards>
        )}
      </SettingFormRow>
      {mode !== "free" && (
        <SettingFormRow<V, "priceCents">
          name="priceCents"
          label="Price"
          help={hasOptions ? "Each option has its own price." : undefined}
        >
          {(field) => (
            <MoneyInput
              value={field.value}
              onValueChange={(c) => field.onChange(c ?? 0)}
              currency={business.currency}
            />
          )}
        </SettingFormRow>
      )}
      {mode === "deposit" && (
        <SettingFormRow<V, "depositCents"> name="depositCents" label="Deposit" required>
          {(field) => (
            <MoneyInput value={field.value} onValueChange={field.onChange} currency={business.currency} />
          )}
        </SettingFormRow>
      )}
      {online && (
        <SettingFormRow<V, "allowPayAtVenue">
          name="allowPayAtVenue"
          fit
          label="Also let people pay at the venue"
          help="They choose when they book: pay online now, or pay at the venue."
        >
          {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        </SettingFormRow>
      )}
      {online && !business.paymentsEnabled && (
        <p className="flex items-start gap-2 bg-warning-soft px-4.5 py-3 text-sm text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Online payments aren&apos;t connected yet — people can&apos;t book this until they are.{" "}
          <Link
            href={dashboardHref(business.slug, "settings/payments")}
            className="font-medium underline underline-offset-2"
          >
            Connect payments
          </Link>
        </p>
      )}
    </Section>
  );
}
