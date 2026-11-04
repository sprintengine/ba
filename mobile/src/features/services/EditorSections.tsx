/** The service editor's settings sections (the website's basics, timing, pricing and rules sections). */
import { router, type Href } from "expo-router";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { CalendarClock } from "lucide-react-native";
import { useCustomerGroups, useQuestions } from "@shared/api/hooks/use-business";
import { useReleaseSchedules } from "@shared/api/hooks/use-releases";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { DEFAULT_LOCALE } from "@shared/format";
import { scheduleSummary, whoLabel } from "@shared/releases/text";
import {
  PAYMENT_MODE_LABEL,
  SERVICE_COLORS,
  type ServiceFormValues as V,
} from "@shared/services/service-form";
import { useVocabulary } from "@shared/vocabulary";
import { Badge, Banner, Button, NumberField, Section, Switch, Text } from "~/ui";
import {
  FormChipGroup,
  FormColorField,
  FormMoneyField,
  FormNumberField,
  FormRadioGroup,
  FormSelect,
  FormSwitch,
  FormTextField,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import {
  coveringSchedules,
  groupChipLabel,
  groupChoices,
  intervalOptions,
  noticeOptions,
  questionsFor,
} from "./editor";
import { FieldRow, FormChoiceField } from "./editor-fields";

export function BasicsSection({ categories }: { categories: readonly string[] }) {
  const { control, setValue } = useFormContext<V>();
  const category = useWatch({ control, name: "category" });
  const suggestions = categories.filter((c) => c !== category.trim());
  return (
    <Section title="Basics">
      <FormTextField
        control={control}
        name="name"
        label="Name"
        placeholder="e.g. Initial consultation"
        autoComplete="off"
        testID="service-name"
      />
      <View style={styles.category}>
        <FormTextField
          control={control}
          name="category"
          label="Category (optional)"
          hint="Groups services on your page."
          autoComplete="off"
          testID="service-category"
        />
        {suggestions.length > 0 ? (
          <View style={styles.suggestions} accessibilityLabel="Categories in use">
            {suggestions.map((c) => (
              <Button
                key={c}
                size="sm"
                variant="secondary"
                label={c}
                accessibilityHint="Uses this category"
                onPress={() => setValue("category", c, { shouldDirty: true, shouldValidate: true })}
              />
            ))}
          </View>
        ) : null}
      </View>
      <FormTextField
        control={control}
        name="description"
        label="Description (optional)"
        hint="Shown to people choosing a service."
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        testID="service-description"
      />
      <FormColorField
        control={control}
        name="color"
        label="Calendar colour"
        swatches={SERVICE_COLORS}
        custom
        testID="service-color"
      />
    </Section>
  );
}

export function TimingSection({ serviceId }: { serviceId: string | null }) {
  const { v } = useVocabulary();
  const { control, setValue } = useFormContext<V>();
  const capacity = useWatch({ control, name: "capacity" });
  const group = capacity > 1;
  return (
    <Section
      title="Timing"
      description={`Buffers block time for setup or cleaning without showing it to the ${v("customer")}.`}
    >
      <FieldRow>
        <FormNumberField
          control={control}
          name="durationMinutes"
          label="Duration"
          unit="min"
          unitLabel="minutes"
          testID="service-duration"
        />
        <FormNumberField
          control={control}
          name="bufferBeforeMinutes"
          label="Buffer before"
          unit="min"
          unitLabel="minutes"
          testID="service-buffer-before"
        />
        <FormNumberField
          control={control}
          name="bufferAfterMinutes"
          label="Buffer after"
          unit="min"
          unitLabel="minutes"
          testID="service-buffer-after"
        />
      </FieldRow>
      <FieldRow>
        <FormChoiceField
          control={control}
          name="slotIntervalMinutes"
          label="Start times every"
          options={intervalOptions}
          testID="service-interval"
        />
        <FormChoiceField
          control={control}
          name="minNoticeMinutes"
          label="Minimum notice"
          options={noticeOptions}
          testID="service-notice"
        />
      </FieldRow>
      <FormNumberField
        control={control}
        name="maxAdvanceDays"
        label="Book up to (optional)"
        hint="How many days ahead people can book. Leave empty to use the business default."
        placeholder="Default"
        unit="days"
        testID="service-max-advance"
      />
      <ReleaseNote serviceId={serviceId} />
      <Switch
        label="Group session"
        description="Several people book the same time (a class, a tour). Each takes one seat."
        value={group}
        onValueChange={(on) => setValue("capacity", on ? 8 : 1, { shouldDirty: true, shouldValidate: true })}
        testID="service-group"
      />
      {group ? <SeatsField /> : null}
    </Section>
  );
}

/**
 * Seats per session: at least 2 while typing too, so emptying the field or typing the "1" of "12" doesn't end the
 * group session (capacity 1) and hide the field mid-edit.
 */
function SeatsField() {
  const { control } = useFormContext<V>();
  const {
    field: { ref, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name: "capacity" });
  return (
    <NumberField
      ref={ref}
      label="Seats per session"
      value={value}
      onChange={(n) => onChange(Math.max(typeof n === "number" ? n : 2, 2))}
      onBlur={() => onBlur()}
      error={fieldState.error?.message}
      testID="service-capacity"
    />
  );
}

/** The active release schedules that decide when this service's days open (admins, existing services). */
function ReleaseNote({ serviceId }: { serviceId: string | null }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const enabled = perms.manageSettings && serviceId !== null;
  const schedules = useReleaseSchedules(business.id, { enabled });
  const groups = useCustomerGroups(business.id, { enabled });
  const covering = coveringSchedules(schedules.data, serviceId);
  if (covering.length === 0) return null;
  const locale = business.locale || DEFAULT_LOCALE;
  return (
    <Banner
      tone="neutral"
      icon={CalendarClock}
      title="Release schedules"
      testID="service-release-note"
      action={
        <Button
          size="sm"
          variant="ghost"
          label="Release schedules"
          onPress={() => router.push(`/dashboard/${business.slug}/settings/release-schedules` as Href)}
        />
      }
    >
      {covering
        .map((s) => `${s.name} (${whoLabel(s, groups.data ?? [])}): ${scheduleSummary(s, locale)}`)
        .join("\n")}
    </Banner>
  );
}

export function PricingSection() {
  const { business } = useBusinessContext();
  const { control } = useFormContext<V>();
  const mode = useWatch({ control, name: "paymentMode" });
  const hasOptions = useWatch({ control, name: "options" }).length > 0;
  const online = mode === "full" || mode === "deposit";
  return (
    <Section title="Price and payment" description="bookanything never takes a cut of your payments.">
      <FormRadioGroup
        control={control}
        name="paymentMode"
        label="How people pay"
        testID="service-payment"
        options={[
          {
            value: "full",
            label: PAYMENT_MODE_LABEL.full,
            description: "Paid when booking. Fewer no-shows.",
          },
          {
            value: "deposit",
            label: PAYMENT_MODE_LABEL.deposit,
            description: "Secure the slot, rest on the day.",
          },
          { value: "at_venue", label: PAYMENT_MODE_LABEL.at_venue, description: "Nothing to pay online." },
          { value: "free", label: PAYMENT_MODE_LABEL.free, description: "No charge at all." },
        ]}
      />
      {mode !== "free" ? (
        <FieldRow>
          <FormMoneyField
            control={control}
            name="priceCents"
            label="Price"
            currency={business.currency}
            locale={business.locale}
            hint={hasOptions ? "Each option has its own price." : undefined}
            testID="service-price"
          />
          {mode === "deposit" ? (
            <FormMoneyField
              control={control}
              name="depositCents"
              label="Deposit"
              currency={business.currency}
              locale={business.locale}
              testID="service-deposit"
            />
          ) : null}
        </FieldRow>
      ) : null}
      {online ? (
        <FormSwitch
          control={control}
          name="allowPayAtVenue"
          label="Also let people pay at the venue"
          description="They choose when they book: pay online now, or pay at the venue."
          testID="service-pay-at-venue"
        />
      ) : null}
      {online && !business.paymentsEnabled ? (
        <Banner
          tone="warning"
          testID="service-payments-warning"
          action={
            <Button
              size="sm"
              variant="secondary"
              label="Connect payments"
              onPress={() => router.push(`/dashboard/${business.slug}/settings/payments` as Href)}
            />
          }
        >
          Online payments aren&apos;t connected yet: people can&apos;t book this until they are.
        </Banner>
      ) : null}
    </Section>
  );
}

export function RulesSection() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const { control, formState } = useFormContext<V>();
  const allowed = useWatch({ control, name: "allowedGroupIds" });
  const saved = (formState.defaultValues?.allowedGroupIds ?? []).filter((id): id is string => !!id);
  const shown = groupChoices(groups.data, allowed, saved);
  return (
    <Section title="Booking rules">
      <FormSwitch
        control={control}
        name="requiresApproval"
        label="Approve each request"
        description={`${v("bookings", { title: true })} stay pending until you accept them.`}
        testID="service-approval"
      />
      <FormSwitch
        control={control}
        name="isPublic"
        label="Show on your booking page"
        description="Private services can still be booked by your team."
        testID="service-public"
      />
      <FormSwitch
        control={control}
        name="isActive"
        label="Active"
        description="Inactive services can't be booked by anyone."
        testID="service-active"
      />
      <FormSelect
        control={control}
        name="locationType"
        label="Where it happens"
        testID="service-location"
        options={[
          { value: "business", label: "At your address" },
          { value: "customer", label: `At the ${v("customer")}'s address` },
          { value: "online", label: "Online" },
        ]}
      />
      {shown.length > 0 ? (
        <FormChipGroup
          control={control}
          name="allowedGroupIds"
          label="Who can book"
          testID="service-groups"
          chips={shown.map((g) => ({ value: g.id, label: groupChipLabel(g) }))}
          hint={
            allowed.length === 0
              ? "Everyone (except restricted groups on hours they aren't listed for)."
              : "Only these groups."
          }
        />
      ) : null}
    </Section>
  );
}

/** The questions asked for this service (managed in Settings › Questions). */
export function QuestionsSection({ serviceId }: { serviceId: string }) {
  const { business } = useBusinessContext();
  const questions = useQuestions(business.id);
  const list = questionsFor(questions.data, serviceId);
  return (
    <Section
      title="Questions"
      description="What people are asked when they book this service."
      testID="service-questions"
      footer={
        <Button
          size="sm"
          variant="secondary"
          label="Manage questions"
          onPress={() => router.push(`/dashboard/${business.slug}/settings/questions` as Href)}
        />
      }
    >
      {list.length === 0 ? (
        <Text variant="callout" tone="subtle">
          No questions: just name and contact details.
        </Text>
      ) : (
        list.map((q) => (
          <View
            key={q.id}
            style={styles.question}
            accessible
            accessibilityLabel={[
              q.label,
              q.required ? "Required" : null,
              q.sensitive ? "Sensitive" : null,
              q.serviceId ? "This service" : "All services",
            ]
              .filter(Boolean)
              .join(", ")}
          >
            <Text style={styles.questionLabel}>{q.label}</Text>
            {q.required ? <Badge label="Required" /> : null}
            {q.sensitive ? <Badge label="Sensitive" tone="warning" /> : null}
            <Text variant="footnote" tone="subtle">
              {q.serviceId ? "This service" : "All services"}
            </Text>
          </View>
        ))
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  category: { gap: space[2] },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  question: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  questionLabel: { flexShrink: 1 },
});
