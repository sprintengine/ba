import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarOff, Clock } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useCreateClosure, useCreateResourceOverride, useResources } from "@shared/api/hooks/use-resources";
import {
  timeOffSchema,
  timeOffTimeError,
  timeOffToInput,
  type TimeOffValues,
} from "@shared/availability/time-off";
import { useCurrentBusiness, usePermissions } from "@shared/business/business-context";
import { todayInTz } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text, TextField, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { ChipRow, ChoiceRow, DateField, TimeField } from "~/features/bookings/fields";
import { useFmt } from "~/features/bookings/fmt";
import { haptics } from "~/features/bookings/haptics";
import { Chip } from "~/features/bookings/parts";

/** Whose time: a resource, or the whole business (a closure, admins only). */
const BUSINESS = "business";

/**
 * Block time: a day off or part of a day for a resource (staff: their own; the API only gives them theirs), or for
 * admins a closure of the whole business. Existing bookings stay: move or cancel them separately. The website's time
 * off dialog (resources › Time off), with its rules (`@shared/availability/time-off`).
 */
export function BlockTimeSheet({
  visible,
  onClose,
  date,
  resourceId,
}: {
  visible: boolean;
  onClose: () => void;
  date?: string;
  resourceId?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Block time" testID="block-time-sheet">
      {visible ? <BlockTimeForm onClose={onClose} date={date} resourceId={resourceId} /> : null}
    </Sheet>
  );
}

function BlockTimeForm({
  onClose,
  date,
  resourceId,
}: {
  onClose: () => void;
  date?: string;
  resourceId?: string;
}) {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const toast = useToast();
  const today = todayInTz(business.timezone);
  const resourcesQ = useResources(business.id);
  const resources = (resourcesQ.data ?? []).filter((r) => r.isActive);
  const [who, setWho] = useState<string>(resourceId ?? "");
  const whoId = who || resources[0]?.id || (perms.manageClosures ? BUSINESS : "");
  const [values, setValues] = useState<TimeOffValues>({
    date: date && date >= today ? date : today,
    kind: "off",
    startTime: "09:00",
    endTime: "13:00",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const createOverride = useCreateResourceOverride(business.id, whoId === BUSINESS ? "" : whoId);
  const createClosure = useCreateClosure(business.id);
  const pending = createOverride.isPending || createClosure.isPending;
  const timeError = timeOffTimeError(values);
  const set = (patch: Partial<TimeOffValues>) => setValues((v0) => ({ ...v0, ...patch }));

  const submit = async () => {
    const parsed = timeOffSchema.safeParse(values);
    if (!parsed.success || !values.date) {
      setError(parsed.error?.issues[0]?.message ?? "Pick a date");
      return;
    }
    setError(null);
    const input = timeOffToInput({ ...values, date: values.date });
    try {
      if (whoId === BUSINESS) await createClosure.mutateAsync(input);
      else await createOverride.mutateAsync(input);
      haptics.success();
      toast.show(whoId === BUSINESS ? "Closure added" : "Time blocked");
      onClose();
    } catch (err) {
      haptics.error();
      setError(errorMessage(err));
    }
  };

  return (
    <View style={styles.root}>
      <Text variant="callout" tone="muted">
        {`Existing ${v("bookings")} aren't changed — move or cancel them separately.`}
      </Text>
      {resources.length > 1 || perms.manageClosures ? (
        <View style={styles.field}>
          <Text variant="callout" weight="medium">
            For
          </Text>
          <ChipRow accessibilityLabel="For">
            {resources.map((r) => (
              <Chip
                key={r.id}
                role="radio"
                testID={`block-for-${r.id}`}
                label={r.name}
                selected={whoId === r.id}
                onPress={() => setWho(r.id)}
              />
            ))}
            {perms.manageClosures ? (
              <Chip
                role="radio"
                testID="block-for-business"
                label="Whole business"
                selected={whoId === BUSINESS}
                onPress={() => setWho(BUSINESS)}
              />
            ) : null}
          </ChipRow>
        </View>
      ) : null}
      <DateField
        label="Date"
        value={values.date ?? today}
        today={today}
        min={today}
        locale={fmt.locale}
        onChange={(d) => set({ date: d })}
      />
      <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel="Type">
        <ChoiceRow
          testID="block-all-day"
          icon={CalendarOff}
          title={whoId === BUSINESS ? "All day" : "Day off"}
          selected={values.kind === "off"}
          onPress={() => set({ kind: "off" })}
        />
        <ChoiceRow
          testID="block-partial"
          icon={Clock}
          title="Part of the day"
          selected={values.kind === "partial"}
          onPress={() => set({ kind: "partial" })}
        />
      </View>
      {values.kind !== "off" ? (
        <View style={styles.times}>
          <View style={styles.flex}>
            <TimeField label="From" value={values.startTime} onChange={(t) => set({ startTime: t })} />
          </View>
          <View style={styles.flex}>
            <TimeField
              label="Until"
              value={values.endTime}
              onChange={(t) => set({ endTime: t })}
              error={timeError}
            />
          </View>
        </View>
      ) : null}
      <TextField
        label="Note (optional)"
        hint="Only your team sees this."
        placeholder="e.g. Training day"
        value={values.reason}
        onChangeText={(t) => set({ reason: t })}
      />
      {error ? (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        testID="save-block-time"
        label="Save"
        fullWidth
        loading={pending}
        // Until the resources load, "who" would default to the whole business (a closure) for admins.
        disabled={!whoId || !!timeError || resourcesQ.isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  field: { gap: space[2] },
  times: { flexDirection: "row", gap: space[3] },
  flex: { flex: 1 },
});
