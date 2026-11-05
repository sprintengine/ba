"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Policies } from "@/lib/api/types";
import { usePaymentsStatus, useUpdateBusiness } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { formatDuration } from "@/lib/format";
import { flattenFieldErrors } from "@/lib/settings/api-fields";
import { policiesSchema, policySummary } from "@/lib/settings/policies-form";
import { useVocabulary } from "@/lib/vocabulary";
import { applyApiErrors, Form, FormRootError } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/ui/number-input";
import { SaveBar, SettingFormRow, SettingGroup, SettingsHeader, settingsStack } from "./settings-common";

const NOTICE = [0, 30, 60, 120, 240, 720, 1440, 2880, 10080];
const noticeLabel = (m: number) =>
  m === 0 ? "No notice" : m < 1440 ? formatDuration(m) : `${m / 1440} day${m === 1440 ? "" : "s"}`;

export function PoliciesSettings() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const update = useUpdateBusiness(business.id);
  const payments = usePaymentsStatus(business.id);
  const form = useForm<Policies>({ resolver: zodResolver(policiesSchema), defaultValues: business.policies });
  const values = useWatch({ control: form.control }) as Policies;
  const stripe = payments.data?.provider === "stripe";

  return (
    <>
      <SettingsHeader segment="policies" />
      <Form
        form={form}
        className={settingsStack}
        onSubmit={async (p) => {
          try {
            const saved = await update.mutateAsync({ policies: p });
            form.reset(saved.policies);
          } catch (err) {
            applyApiErrors(form, flattenFieldErrors(err, ["policies"]));
          }
        }}
      >
        <SettingGroup
          title="When people can book"
          description="On your public page. Services can override these, and your team can always book any free time."
        >
          <SettingFormRow<Policies, "minNoticeMinutes">
            name="minNoticeMinutes"
            label="Minimum notice"
            help="How close to the start someone can still book online."
          >
            {(field) => (
              <Select value={String(field.value)} onValueChange={(x) => field.onChange(Number(x))}>
                <SelectTrigger ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...NOTICE, field.value])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {noticeLabel(m)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </SettingFormRow>
          <SettingFormRow<Policies, "maxAdvanceDays">
            name="maxAdvanceDays"
            label="How far ahead"
            help="The furthest date people can pick, counted from today. Release schedules can keep days closed until they open."
          >
            {(field) => (
              <NumberInput
                ref={field.ref}
                mode="decimal"
                value={field.value}
                onValueChange={(n) => field.onChange(n ?? 0)}
                min={1}
                unit="days"
              />
            )}
          </SettingFormRow>
          <SettingFormRow<Policies, "nextAvailableOnly">
            name="nextAvailableOnly"
            fit
            label="Offer the next available time only"
            help={`${v("customers", { title: true })} see the earliest time and can ask for a later one. Your team still sees everything.`}
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </SettingFormRow>
          <SettingFormRow<Policies, "requireCustomerPhone">
            name="requireCustomerPhone"
            fit
            label="Require a phone number"
            help="Off, phone is optional when people book online."
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </SettingFormRow>
        </SettingGroup>

        <SettingGroup
          title="Cancelling and rescheduling"
          description={policySummary(values, v("customers", { title: true }))}
          note="When you cancel, people always get a full refund. Card processing fees aren't returned by the payment provider."
        >
          <SettingFormRow<Policies, "allowCustomerCancel">
            name="allowCustomerCancel"
            fit
            label="Let people cancel online"
            help="From the link in their confirmation email or their account."
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </SettingFormRow>
          <SettingFormRow<Policies, "allowCustomerReschedule">
            name="allowCustomerReschedule"
            fit
            label="Let people reschedule online"
            help="Only to free times, and only before the cancellation window closes."
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </SettingFormRow>
          <SettingFormRow<Policies, "cancellationNoticeHours">
            name="cancellationNoticeHours"
            label="Free cancellation up to"
            help="Hours before the start. After this it counts as a late cancellation."
          >
            {(field) => (
              <NumberInput
                ref={field.ref}
                mode="decimal"
                value={field.value}
                onValueChange={(n) => field.onChange(n ?? 0)}
                min={0}
                unit="hours"
              />
            )}
          </SettingFormRow>
          <SettingFormRow<Policies, "lateCancellationRefundPercent">
            name="lateCancellationRefundPercent"
            label="Refund for late cancellations"
            help="Share of what they paid online. You can always refund more by hand."
          >
            {(field) => (
              <Select value={String(field.value)} onValueChange={(x) => field.onChange(Number(x))}>
                <SelectTrigger ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([0, 25, 50, 75, 100, field.value])]
                    .sort((a, b) => a - b)
                    .map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {p === 0 ? "No refund" : p === 100 ? "Full refund" : `${p}%`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </SettingFormRow>
        </SettingGroup>

        <SettingGroup
          title="Unpaid holds"
          description={`When a service is paid online, the time is held while the ${v("customer")} pays. If they don't finish, it's released.`}
        >
          <SettingFormRow<Policies, "holdMinutes">
            name="holdMinutes"
            label="Hold the slot for"
            help={
              stripe
                ? "Stripe needs at least 30 minutes."
                : "Long enough to pay, short enough not to block others."
            }
          >
            {(field) => (
              <NumberInput
                ref={field.ref}
                mode="decimal"
                value={field.value}
                onValueChange={(n) => field.onChange(n ?? 0)}
                min={stripe ? 30 : 5}
                unit="min"
              />
            )}
          </SettingFormRow>
        </SettingGroup>

        <FormRootError />
        <SaveBar dirty={form.formState.isDirty} onDiscard={() => form.reset(business.policies)} />
      </Form>
    </>
  );
}
