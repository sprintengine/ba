/**
 * The offer form's sections (the website's offer-basics-fields and offer-schedule-fields), bound to the form with
 * `~/ui/form`: basics, services, discount, when it applies (days, hours, last-minute), dates and limits.
 */
import { useRef } from "react";
import {
  useController,
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useBusinessContext } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { WEEKDAYS } from "@shared/offers/display";
import {
  LAST_MINUTE_MAX_HOURS,
  MAX_TIME_WINDOWS,
  switchDiscountType,
  type OfferFormDiscount,
  type OfferFormValues as V,
} from "@shared/offers/offer-form";
import { useVocabulary } from "@shared/vocabulary";
import { Button, ChipGroup, IconButton, Section, SegmentedControl, Text } from "~/ui";
import {
  FormChipGroup,
  FormDateField,
  FormMoneyField,
  FormNumberField,
  FormSwitch,
  FormTextField,
  FormTimeField,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { DAY_PRESETS, isPreset, nextTimeWindow } from "./offers";

type Props = { form: UseFormReturn<V> };

export function BasicsSection({ form }: Props) {
  const { v } = useVocabulary();
  return (
    <Section title="Basics">
      <FormTextField
        control={form.control}
        name="name"
        label="Name"
        testID="offer-name"
        placeholder="e.g. Off-peak afternoons"
        hint={`${v("customers", { title: true })} see this name when they book.`}
        maxLength={80}
        autoComplete="off"
      />
      <FormTextField
        control={form.control}
        name="description"
        label="Description (optional)"
        placeholder={`Anything ${v("customers")} should know`}
        maxLength={300}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
    </Section>
  );
}

export function ServicesSection({ form, services }: Props & { services: Service[] }) {
  const selected = useWatch({ control: form.control, name: "serviceIds" });
  const allIds = services.map((s) => s.id);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  return (
    <Section
      title="Services"
      description="The deal applies to these services, including their options and add-ons."
      action={
        services.length > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            label={allOn ? "Clear all" : "Select all"}
            testID="offer-services-all"
            onPress={() =>
              form.setValue("serviceIds", allOn ? [] : allIds, {
                shouldDirty: true,
                shouldValidate: form.formState.isSubmitted,
              })
            }
          />
        ) : null
      }
    >
      {services.length === 0 ? (
        <Text variant="callout" tone="subtle">
          Add a service first: deals discount services.
        </Text>
      ) : (
        <FormChipGroup
          control={form.control}
          name="serviceIds"
          label="Applies to"
          testID="offer-services"
          chips={services.map((s) => ({
            value: s.id,
            label: s.isPublic ? s.name : `${s.name} (private)`,
            accessibilityLabel: s.isPublic ? s.name : `${s.name}, private: not on your booking page`,
          }))}
        />
      )}
    </Section>
  );
}

export function DiscountSection({ form }: Props) {
  const { business } = useBusinessContext();
  const discount = useWatch({ control: form.control, name: "discount" });
  // The other type's last value, so switching back and forth doesn't lose it.
  const remembered = useRef({
    percent: discount.type === "percent" ? discount.percent : 20,
    amountCents: discount.type === "fixed" ? discount.amountCents : null,
  });
  const setType = (type: OfferFormDiscount["type"]) => {
    const current = form.getValues("discount");
    if (current.type === "percent") remembered.current.percent = current.percent;
    else remembered.current.amountCents = current.amountCents;
    form.setValue("discount", switchDiscountType(current, type, remembered.current), {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
  };
  return (
    <Section title="Discount" description="Taken off the full price of the booking.">
      <SegmentedControl<OfferFormDiscount["type"]>
        accessibilityLabel="Discount type"
        value={discount.type}
        onChange={setType}
        segments={[
          { value: "percent", label: "Percentage" },
          { value: "fixed", label: "Fixed amount" },
        ]}
      />
      {discount.type === "percent" ? (
        <FormNumberField
          key="percent"
          control={form.control}
          name="discount.percent"
          label="Percentage off"
          testID="offer-percent"
          unit="%"
          unitLabel="percent"
        />
      ) : (
        <FormMoneyField
          key="fixed"
          control={form.control}
          name="discount.amountCents"
          label="Amount off"
          testID="offer-amount"
          currency={business.currency}
          locale={business.locale}
        />
      )}
    </Section>
  );
}

export function ScheduleSection({ form }: Props) {
  return (
    <Section title="When it applies" description="A time gets the deal when every condition you set matches.">
      <DaysField control={form.control} />
      <TimeWindowsField form={form} />
      <LastMinuteField control={form.control} />
    </Section>
  );
}

function DaysField({ control }: { control: Control<V> }) {
  const { field, fieldState } = useController({ control, name: "schedule.daysOfWeek" });
  const days = field.value;
  const set = (next: readonly number[]) => field.onChange([...new Set(next)].sort((a, b) => a - b));
  return (
    <View style={styles.group}>
      <ChipGroup
        label="Days"
        testID="offer-days"
        chips={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.short, accessibilityLabel: d.long }))}
        value={days.map(String)}
        onChange={(next) => set(next.map(Number))}
        hint={days.length === 0 ? "No days picked: every day." : undefined}
        error={fieldState.error?.message}
      />
      <View style={styles.presets}>
        {DAY_PRESETS.map((p) => {
          const on = isPreset(days, p.days);
          return (
            <Button
              key={p.label}
              size="sm"
              variant={on ? "secondary" : "ghost"}
              label={p.label}
              accessibilityState={{ selected: on }}
              testID={`offer-days-${p.label.toLowerCase().replace(" ", "-")}`}
              onPress={() => set([...p.days])}
            />
          );
        })}
      </View>
    </View>
  );
}

function TimeWindowsField({ form }: Props) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "schedule.timeWindows" });
  const { errors } = useFormState({ control: form.control, name: "schedule.timeWindows" });
  const listError = errors.schedule?.timeWindows?.root?.message ?? errors.schedule?.timeWindows?.message;
  const full = fields.length >= MAX_TIME_WINDOWS;
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text variant="callout" weight="medium" style={styles.flex}>
          Hours
        </Text>
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          label="Add hours"
          testID="offer-add-hours"
          disabled={full}
          onPress={() => append(nextTimeWindow(form.getValues("schedule.timeWindows")))}
        />
      </View>
      {fields.map((f, i) => (
        <View key={f.id} style={styles.window} testID={`offer-window-${i}`}>
          <View style={styles.flex}>
            <FormTimeField
              control={form.control}
              name={`schedule.timeWindows.${i}.start`}
              label={`Window ${i + 1} from`}
              testID={`offer-window-${i}-start`}
            />
            <FormTimeField
              control={form.control}
              name={`schedule.timeWindows.${i}.end`}
              label={`Window ${i + 1} to`}
              testID={`offer-window-${i}-end`}
            />
          </View>
          <IconButton
            icon={Trash2}
            size={20}
            color="mutedForeground"
            accessibilityLabel={`Remove window ${i + 1}`}
            testID={`offer-window-${i}-remove`}
            onPress={() => remove(i)}
          />
        </View>
      ))}
      <Text variant="footnote" tone={listError ? "danger" : "subtle"}>
        {listError ??
          (fields.length === 0
            ? "No hours set: all day. Times match when they start inside a window."
            : "Times match when they start inside a window.")}
      </Text>
    </View>
  );
}

function LastMinuteField({ control }: { control: Control<V> }) {
  const lastMinute = useWatch({ control, name: "lastMinute" });
  return (
    <View style={styles.group}>
      <FormSwitch
        control={control}
        name="lastMinute"
        label="Last-minute only"
        testID="offer-last-minute"
        description="Only applies to times starting soon, to fill gaps that would otherwise go empty."
      />
      {lastMinute ? (
        <FormNumberField
          control={control}
          name="schedule.lastMinuteHours"
          label="Starting within"
          testID="offer-last-minute-hours"
          unit="hours"
          hint={`Up to ${LAST_MINUTE_MAX_HOURS} hours (a week).`}
        />
      ) : null}
    </View>
  );
}

export function LimitsSection({ form }: Props) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const validFrom = useWatch({ control: form.control, name: "validFrom" });
  const today = todayInTz(business.timezone);
  return (
    <Section title="Dates and limits">
      <FormDateField
        control={form.control}
        name="validFrom"
        label="Starts"
        testID="offer-valid-from"
        hint="Leave empty to start straight away."
        clearable
        defaultDate={today}
        locale={business.locale}
      />
      <FormDateField
        control={form.control}
        name="validUntil"
        label="Ends"
        testID="offer-valid-until"
        hint="Leave empty for no end date."
        clearable
        min={validFrom && validFrom > today ? validFrom : today}
        defaultDate={validFrom && validFrom > today ? validFrom : today}
        locale={business.locale}
      />
      <FormNumberField
        control={form.control}
        name="maxRedemptions"
        label="Limit (optional)"
        testID="offer-limit"
        placeholder="Unlimited"
        unit={v("bookings")}
        hint={`The deal stops after this many ${v("bookings")}.`}
      />
      <FormSwitch
        control={form.control}
        name="active"
        label="Active"
        testID="offer-active"
        description="Paused deals are kept but not applied to new bookings."
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: space[2] },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: space[3] },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space[1] },
  window: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
