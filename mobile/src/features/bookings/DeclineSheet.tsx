import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useDeclineBooking } from "@shared/api/hooks/use-bookings";
import type { Booking } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { paidInPersonNote, refundableOnline } from "@shared/dashboard/booking-copy";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text, TextField, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { useFmt } from "./fmt";
import { haptics } from "./haptics";

export type DeclineTarget = Pick<
  Booking,
  | "id"
  | "start"
  | "customer"
  | "service"
  | "amountPaidCents"
  | "amountPaidInPersonCents"
  | "amountRefundedCents"
  | "currency"
>;

/** Decline a pending request, with an optional reason quoted in the email to the customer. */
export function DeclineSheet({
  booking,
  visible,
  onClose,
  onDeclined,
}: {
  booking: DeclineTarget;
  visible: boolean;
  onClose: () => void;
  onDeclined?: () => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const toast = useToast();
  const decline = useDeclineBooking(business.id);
  const [reason, setReason] = useState("");
  const paid = refundableOnline(booking);
  const description = `${booking.customer.name} · ${booking.service.name} · ${fmt.date(booking.start, "dayMonth")}, ${fmt.time(booking.start)}. The ${v("customer")} is emailed and the time becomes free.${
    paid > 0 ? ` The ${fmt.money(paid)} they paid online is refunded in full.` : ""
  }${paidInPersonNote(booking)}`;

  const submit = async () => {
    try {
      await decline.mutateAsync({ id: booking.id, reason });
      haptics.warning();
      toast.show(`${v("booking", { title: true })} declined`);
      setReason("");
      onClose();
      onDeclined?.();
    } catch (err) {
      haptics.error();
      toast.show(errorMessage(err), "danger");
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => !decline.isPending && onClose()}
      title={`Decline this ${v("booking")}?`}
      testID="decline-sheet"
      footer={
        <View style={styles.actions}>
          <Button label="Keep request" variant="secondary" onPress={onClose} />
          <Button
            testID="confirm-decline"
            label="Decline"
            variant="destructive"
            loading={decline.isPending}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <Text tone="muted">{description}</Text>
      <TextField
        label="Reason (optional)"
        hint={`Included in the email to the ${v("customer")}.`}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        multiline
        placeholder="e.g. We're fully booked that week"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2] },
});
