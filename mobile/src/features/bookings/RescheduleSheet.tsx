import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { useRescheduleBooking } from "@shared/api/hooks/use-bookings";
import type { Booking, Slot } from "@shared/api/types";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { toPlainDate, todayInTz, zonedToIso } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { Button, SegmentedControl, Sheet, Switch, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { ChipRow, DateField, TimeField } from "./fields";
import { useFmt } from "./fmt";
import { haptics } from "./haptics";
import { Chip } from "./parts";
import { SlotPicker } from "./SlotPicker";

/** Move a booking to a free time (staff availability) or an exact time; a fresh form each time it opens. */
export function RescheduleSheet({
  booking,
  visible,
  onClose,
}: {
  booking: Booking;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Reschedule" testID="reschedule-sheet">
      {visible ? <RescheduleForm booking={booking} onClose={onClose} /> : null}
    </Sheet>
  );
}

function RescheduleForm({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const toast = useToast();
  const reschedule = useRescheduleBooking(business.id);
  const today = todayInTz(business.timezone);
  const current = toPlainDate(booking.start, business.timezone);
  const [date, setDate] = useState(current < today ? today : current);
  const primary = booking.resources.find((r) => r.kind === "person") ?? booking.resources[0] ?? null;
  const [keep, setKeep] = useState<string>(primary ? primary.id : "any");
  const [mode, setMode] = useState<"slots" | "exact">("slots");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [exact, setExact] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const start =
    mode === "slots" ? (slot?.start ?? null) : exact ? zonedToIso(date, exact, business.timezone) : null;

  const changeDate = (d: string) => {
    setDate(d);
    setSlot(null);
  };

  const submit = async () => {
    if (!start) return;
    const chosen = mode === "slots" ? (slot ? slot.resourceIds : null) : keep !== "any" ? [keep] : null;
    try {
      await reschedule.mutateAsync({
        id: booking.id,
        input: {
          start,
          // Staff: the backend keeps their own calendar; admins pin the chosen assignment.
          resourceIds: perms.bookAnyCalendar ? chosen : null,
          notifyCustomer: notify,
        },
      });
      haptics.success();
      toast.show(`Moved to ${fmt.date(start, "dayMonth")}, ${fmt.time(start)}`);
      onClose();
    } catch (err) {
      haptics.error();
      if (isApiError(err) && err.code === "SLOT_UNAVAILABLE") {
        toast.show("That time was just taken. Pick another one.", "danger");
        setSlot(null);
      } else {
        toast.show(errorMessage(err), "danger");
      }
    }
  };

  return (
    <View style={styles.root}>
      <Text tone="muted">
        {booking.customer.name} · {booking.service.name}
        {booking.option ? ` (${booking.option.name})` : ""} · currently {fmt.date(booking.start, "dayMonth")},{" "}
        {fmt.time(booking.start)}
      </Text>
      <DateField
        label="Date"
        value={date}
        today={today}
        min={today}
        locale={fmt.locale}
        onChange={changeDate}
      />
      {booking.resources.length > 0 ? (
        <View style={styles.field}>
          <Text variant="callout" weight="medium">
            With
          </Text>
          <ChipRow accessibilityLabel="With">
            {primary ? (
              <Chip
                role="radio"
                label={`${primary.name} (same as now)`}
                selected={keep === primary.id}
                onPress={() => {
                  setKeep(primary.id);
                  setSlot(null);
                }}
              />
            ) : null}
            <Chip
              role="radio"
              label={`Any available ${v("resource")}`}
              selected={keep === "any"}
              onPress={() => {
                setKeep("any");
                setSlot(null);
              }}
            />
          </ChipRow>
        </View>
      ) : null}
      <SegmentedControl
        accessibilityLabel="How to pick the time"
        value={mode}
        onChange={setMode}
        segments={[
          { value: "slots", label: "Free times" },
          { value: "exact", label: "Exact time" },
        ]}
      />
      {mode === "slots" ? (
        <SlotPicker
          serviceId={booking.service.id}
          optionId={booking.option?.id ?? null}
          addonIds={booking.addons.map((a) => a.id)}
          resourceId={keep === "any" ? null : keep}
          date={date}
          onDateChange={changeDate}
          value={slot?.start ?? null}
          onChange={setSlot}
          excludeStart={booking.start}
          excludeBookingId={booking.id}
        />
      ) : (
        <TimeField
          label="Start time"
          value={exact}
          onChange={setExact}
          hint="We still check the time is free. Use this for times between the usual slots."
        />
      )}
      <Switch
        label={`Email the ${v("customer")}`}
        description="Sends the new date and time."
        value={notify}
        onValueChange={setNotify}
      />
      <Button
        testID="confirm-reschedule"
        label={start ? `Move to ${fmt.time(start)}` : "Pick a time"}
        fullWidth
        disabled={!start}
        loading={reschedule.isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  field: { gap: space[2] },
});
