import { StyleSheet, View } from "react-native";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import type { Resource, Service } from "@shared/api/types";
import type { NewBookingValues as Values } from "@shared/dashboard/new-booking";
import { useVocabulary } from "@shared/vocabulary";
import { SegmentedControl, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { ChipRow, DateField, TimeField } from "../fields";
import { useFmt } from "../fmt";
import { Chip } from "../parts";
import { SlotPicker } from "../SlotPicker";

/** The active resources a service can be booked with (all active ones when it names none). */
export function servicePool(service: Service, resources: readonly Resource[]): Resource[] {
  const ids = new Set(service.requirements.flatMap((r) => r.resourceIds));
  return resources.filter((r) => r.isActive && (ids.size === 0 || ids.has(r.id)));
}

/** Step 2: the date, who with (when several can do it), and a free time or an exact time. */
export function WhenStep({
  service,
  resources,
  today,
}: {
  service: Service;
  resources: readonly Resource[];
  today: string;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const form = useFormContext<Values>();
  const [optionId, addonIds, date, timeMode, slotStart, withResource, exactTime] = useWatch({
    control: form.control,
    name: ["optionId", "addonIds", "date", "timeMode", "slotStart", "withResource", "exactTime"],
  });
  const { errors } = useFormState({ control: form.control, name: ["slotStart", "exactTime"] });
  const pool = servicePool(service, resources);
  const withValid = withResource === "any" || pool.some((r) => r.id === withResource);
  const needsOption = service.options.length > 0 && !optionId;

  return (
    <View style={styles.root}>
      <DateField
        label="Date"
        testID="new-booking-date"
        value={date}
        today={today}
        min={today}
        locale={fmt.locale}
        onChange={(d) => {
          form.setValue("date", d);
          form.setValue("slotStart", null);
        }}
      />
      {pool.length > 1 ? (
        <View style={styles.field}>
          <Text variant="callout" weight="medium">
            With
          </Text>
          <ChipRow accessibilityLabel="With">
            <Chip
              role="radio"
              label={`Any ${v("resource")}`}
              selected={!withValid || withResource === "any"}
              onPress={() => {
                form.setValue("withResource", "any");
                form.setValue("slotStart", null);
              }}
            />
            {pool.map((r) => (
              <Chip
                key={r.id}
                role="radio"
                testID={`with-${r.id}`}
                label={r.name}
                selected={withValid && withResource === r.id}
                onPress={() => {
                  form.setValue("withResource", r.id);
                  form.setValue("slotStart", null);
                }}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <SegmentedControl
        accessibilityLabel="How to pick the time"
        value={timeMode}
        onChange={(m) => form.setValue("timeMode", m)}
        segments={[
          { value: "slots", label: "Free times" },
          { value: "exact", label: "Exact time" },
        ]}
      />
      {timeMode === "slots" ? (
        needsOption ? (
          <Text variant="callout" tone="subtle">
            Choose an option to see free times.
          </Text>
        ) : (
          <View style={styles.field}>
            <SlotPicker
              serviceId={service.id}
              optionId={optionId}
              addonIds={addonIds}
              resourceId={withValid && withResource !== "any" ? withResource : null}
              date={date}
              onDateChange={(d) => form.setValue("date", d)}
              value={slotStart}
              onChange={(slot) => {
                form.setValue("slotStart", slot.start, { shouldValidate: !!errors.slotStart });
                form.setValue("slotResourceIds", slot.resourceIds);
                form.setValue("slotOffer", slot.offer ?? null);
              }}
            />
            {errors.slotStart?.message ? (
              <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
                {errors.slotStart.message}
              </Text>
            ) : null}
          </View>
        )
      ) : (
        <TimeField
          testID="new-booking-exact-time"
          label="Start time"
          value={exactTime}
          hint="Any time you like. We still check nobody is double-booked."
          error={errors.exactTime?.message}
          onChange={(t) => form.setValue("exactTime", t, { shouldValidate: !!errors.exactTime })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  field: { gap: space[2] },
});
