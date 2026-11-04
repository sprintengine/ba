import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm, useWatch, type Control } from "react-hook-form";
import type { Policies } from "@shared/api/types";
import { useUpdateBusiness } from "@shared/api/hooks/use-business";
import { usePaymentsStatus } from "@shared/api/hooks/use-payments";
import { useBusinessContext } from "@shared/business/business-context";
import { flattenFieldErrors } from "@shared/settings/api-fields";
import { policiesSchema, policySummary } from "@shared/settings/policies-form";
import { useVocabulary } from "@shared/vocabulary";
import { Section, Select, Text } from "~/ui";
import {
  applyApiErrors,
  FormNumberField,
  FormRootError,
  FormSwitch,
  HeaderButton,
  SaveBar,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { SettingsPage } from "../SettingsPage";
import { noticeOptions, refundOptions, STRIPE_MIN_HOLD } from "./policies";

/** Settings › Booking policies (the website's PoliciesSettings): notice, how far ahead, cancelling, unpaid holds. */
export function PoliciesSettings() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const update = useUpdateBusiness(business.id);
  const payments = usePaymentsStatus(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<Policies>({ resolver: zodResolver(policiesSchema), defaultValues: business.policies });
  const { isDirty, isSubmitting } = form.formState;
  useUnsavedChangesGuard(isDirty);
  const values = useWatch({ control: form.control }) as Policies;
  const stripe = payments.data?.provider === "stripe";

  const submit = form.handleSubmit(async (p) => {
    // The website's field clamps to Stripe's minimum; here it's said on the field instead.
    if (stripe && p.holdMinutes < STRIPE_MIN_HOLD) {
      form.setError("holdMinutes", { message: "Stripe needs at least 30 minutes." }, { shouldFocus: true });
      return;
    }
    try {
      const saved = await update.mutateAsync({ policies: p });
      form.reset(saved.policies);
      feedback.saved("Policies saved");
    } catch (err) {
      applyApiErrors(form, flattenFieldErrors(err, ["policies"]));
    }
  });

  return (
    <SettingsPage
      segment="policies"
      headerRight={() => (
        <HeaderButton
          label="Save"
          primary
          testID="settings-save"
          disabled={!isDirty}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      )}
    >
      <Section
        title="When people can book"
        description="These apply to your public page. Services can override them, and your team can always book any free time."
      >
        <NumberSelect
          control={form.control}
          name="minNoticeMinutes"
          label="Minimum notice"
          testID="policies-notice"
          options={noticeOptions}
          help="How close to the start someone can still book online. With 2 hours, a 10:00 slot disappears at 08:00."
        />
        <FormNumberField
          control={form.control}
          name="maxAdvanceDays"
          label="How far ahead"
          testID="policies-max-advance"
          unit="days"
          hint="The furthest date people can pick, counted from today. Release schedules can keep days closed until they open."
        />
        <FormSwitch
          control={form.control}
          name="nextAvailableOnly"
          label="Offer the next available time only"
          testID="policies-next-only"
          description={`Instead of a calendar of every free time, ${v("customers")} are offered the earliest one and can ask for a later one, one at a time. Your team still sees everything.`}
        />
        <FormSwitch
          control={form.control}
          name="requireCustomerPhone"
          label="Ask for a phone number"
          testID="policies-require-phone"
          description="Makes phone required when people book online — handy for text reminders or last-minute changes."
        />
      </Section>

      <Section
        title="Cancelling and rescheduling"
        description={policySummary(values, v("customers", { title: true }))}
        testID="policies-summary"
      >
        <FormSwitch
          control={form.control}
          name="allowCustomerCancel"
          label="Let people cancel online"
          testID="policies-allow-cancel"
          description="From the link in their confirmation email or their account."
        />
        <FormSwitch
          control={form.control}
          name="allowCustomerReschedule"
          label="Let people reschedule online"
          testID="policies-allow-reschedule"
          description="Only to free times, and only before the cancellation window closes."
        />
        <FormNumberField
          control={form.control}
          name="cancellationNoticeHours"
          label="Free cancellation up to"
          testID="policies-cancel-hours"
          unit="hours"
          hint="Hours before the start. After this it counts as a late cancellation."
        />
        <NumberSelect
          control={form.control}
          name="lateCancellationRefundPercent"
          label="Refund for late cancellations"
          testID="policies-refund"
          options={refundOptions}
          help="Share of what they paid online. You can always refund more by hand."
        />
        <Text variant="footnote" tone="subtle">
          When you cancel, people always get a full refund. Card processing fees aren&apos;t returned by the
          payment provider.
        </Text>
      </Section>

      <Section
        title="Unpaid holds"
        description={`When a service is paid online, the time is held while the ${v("customer")} pays. If they don't finish, it's released.`}
      >
        <FormNumberField
          control={form.control}
          name="holdMinutes"
          label="Hold the slot for"
          testID="policies-hold"
          unit="min"
          unitLabel="minutes"
          hint={
            stripe
              ? "Stripe needs at least 30 minutes."
              : "Long enough to pay, short enough not to block others."
          }
        />
      </Section>

      <FormRootError control={form.control} />
      <SaveBar
        dirty={isDirty}
        saving={isSubmitting}
        onSave={() => void submit()}
        onDiscard={() => form.reset(business.policies)}
      />
    </SettingsPage>
  );
}

/** A number chosen from a list (the website's Select over numbers); the current value is always offered. */
function NumberSelect({
  control,
  name,
  label,
  options,
  help,
  testID,
}: {
  control: Control<Policies>;
  name: "minNoticeMinutes" | "lateCancellationRefundPercent";
  label: string;
  options: (current: number) => { value: string; label: string }[];
  help: string;
  testID: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <>
      <Select
        label={label}
        testID={testID}
        value={String(field.value)}
        options={options(field.value)}
        onChange={(value) => field.onChange(Number(value))}
        error={fieldState.error?.message}
      />
      <Text variant="footnote" tone="subtle">
        {help}
      </Text>
    </>
  );
}
