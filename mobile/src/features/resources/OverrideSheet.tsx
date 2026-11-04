import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm, useWatch, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import type { AvailabilityOverrideInput } from "@shared/api/types";
import {
  timeOffDefaults,
  timeOffReady,
  timeOffSchema,
  timeOffTimeError,
  timeOffToInput,
  type TimeOffValues,
} from "@shared/availability/time-off";
import { useBusinessContext } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { Banner, Button, Sheet, Text, TimeField } from "~/ui";
import {
  applyApiErrors,
  confirmDiscard,
  FormDateField,
  FormRadioGroup,
  FormRootError,
  FormTextField,
} from "~/ui/form";
import { space } from "~/ui/tokens";

export type OverrideSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Saves the entry; throws the API's error (shown on the form). */
  onSubmit: (input: AvailabilityOverrideInput) => Promise<void>;
  /** Offer "Extra hours" (a resource's time off) besides closing (a business closure). */
  allowExtra?: boolean;
  title: string;
  /** Prefix of the sheet's testIDs: `<prefix>-sheet`, `-date`, `-kind`, `-start`, `-end`, `-reason`, `-save`. */
  testID: string;
};

/**
 * Add time off, extra hours or a closure (the website's OverrideDialog): a date, a whole day or a time range, and a
 * note. Kept mounted between uses, so the next entry starts from the last one's date and type.
 */
export function OverrideSheet({ visible, onClose, onSubmit, allowExtra, title, testID }: OverrideSheetProps) {
  const { business } = useBusinessContext();
  const today = todayInTz(business.timezone);
  const form = useForm<TimeOffValues>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: timeOffDefaults(today),
  });
  const values = useWatch({ control: form.control }) as TimeOffValues;
  const timed = values.kind !== "off";
  const { isDirty, isSubmitting } = form.formState;

  const close = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    form.reset();
    onClose();
  };

  const submit = form.handleSubmit(async (v) => {
    if (!v.date) return;
    try {
      await onSubmit(timeOffToInput({ ...v, date: v.date }));
      form.reset({ ...v, reason: "" });
      onClose();
    } catch (err) {
      applyApiErrors(form, err);
    }
  });

  return (
    <Sheet
      visible={visible}
      onClose={() => void close()}
      title={title}
      testID={`${testID}-sheet`}
      footer={
        <Button
          testID={`${testID}-save`}
          label="Save"
          fullWidth
          disabled={!timeOffReady(values)}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Banner tone="neutral">Existing bookings aren&apos;t changed — move or cancel them separately.</Banner>
      <FormDateField
        control={form.control}
        name="date"
        label="Date"
        testID={`${testID}-date`}
        min={today}
        locale={business.locale}
      />
      <FormRadioGroup
        control={form.control}
        name="kind"
        label="Type"
        testID={`${testID}-kind`}
        options={[
          { value: "off" as const, label: allowExtra ? "Day off" : "All day" },
          { value: "partial" as const, label: "Part of the day" },
          ...(allowExtra ? [{ value: "extra" as const, label: "Extra hours" }] : []),
        ]}
      />
      {timed ? (
        <TimeRange
          control={form.control}
          label={values.kind === "extra" ? "Available" : "Unavailable"}
          testID={testID}
        />
      ) : null}
      <FormTextField
        control={form.control}
        name="reason"
        label="Note (optional)"
        testID={`${testID}-reason`}
        hint="Only your team sees this."
        placeholder="e.g. Training day"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <FormRootError control={form.control} />
    </Sheet>
  );
}

/** From–until times, checked as they change; the server's errors on either time show under them too. */
function TimeRange({
  control,
  label,
  testID,
}: {
  control: Control<TimeOffValues>;
  label: string;
  testID: string;
}) {
  const { field: start, fieldState: startState } = useController({ control, name: "startTime" });
  const { field: end, fieldState: endState } = useController({ control, name: "endTime" });
  const kind = useWatch({ control, name: "kind" });
  const error =
    timeOffTimeError({ kind, startTime: start.value, endTime: end.value }) ??
    startState.error?.message ??
    endState.error?.message;
  return (
    <View style={styles.range}>
      <TimeField
        label={`${label} from`}
        testID={`${testID}-start`}
        value={start.value ?? "09:00"}
        onChange={start.onChange}
      />
      <TimeField
        label={`${label} until`}
        testID={`${testID}-end`}
        value={end.value ?? "13:00"}
        onChange={end.onChange}
      />
      {error ? (
        <Text
          variant="footnote"
          tone="danger"
          accessibilityLiveRegion="polite"
          testID={`${testID}-time-error`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ range: { gap: space[1] } });
