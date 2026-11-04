import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ban, HandCoins, Undo2 } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useCancelBooking } from "@shared/api/hooks/use-bookings";
import type { Booking } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { refundableOnline, refundPreview, type RefundChoice } from "@shared/dashboard/booking-copy";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Switch, Text, TextField, useTheme, useToast } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { ChoiceRow } from "./fields";
import { useFmt } from "./fmt";
import { haptics } from "./haptics";

/** Cancel with a refund choice (follow the policy / full / none), a reason and whether to email the customer. */
export function CancelSheet({
  booking,
  visible,
  onClose,
}: {
  booking: Booking;
  visible: boolean;
  onClose: () => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const { colors } = useTheme();
  const fmt = useFmt();
  const toast = useToast();
  const cancel = useCancelBooking(business.id);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<RefundChoice>("policy");
  const [notify, setNotify] = useState(true);
  const paid = refundableOnline(booking) > 0;
  const preview = refundPreview(booking, refund);
  const money = (choice: RefundChoice) => fmt.money(refundPreview(booking, choice).amountCents);

  const submit = async () => {
    try {
      await cancel.mutateAsync({
        id: booking.id,
        input: { reason: reason.trim() || null, refund: paid ? refund : "none", notifyCustomer: notify },
      });
      haptics.warning();
      toast.show(
        preview.amountCents > 0 && paid
          ? `${v("booking", { title: true })} cancelled. ${fmt.money(preview.amountCents)} refund on its way.`
          : `${v("booking", { title: true })} cancelled`,
      );
      onClose();
    } catch (err) {
      haptics.error();
      toast.show(errorMessage(err), "danger");
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => !cancel.isPending && onClose()}
      title={`Cancel this ${v("booking")}?`}
      testID="cancel-sheet"
      footer={
        <View style={styles.actions}>
          <Button label={`Keep ${v("booking")}`} variant="secondary" onPress={onClose} />
          <Button
            testID="confirm-cancel"
            label={`Cancel ${v("booking")}`}
            variant="destructive"
            loading={cancel.isPending}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <Text tone="muted">
        {booking.customer.name} · {booking.service.name} · {fmt.date(booking.start, "dayMonth")},{" "}
        {fmt.time(booking.start)}. The time becomes free for others straight away.
      </Text>
      {paid ? (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Refund">
          <Text variant="callout" weight="medium">
            Refund
          </Text>
          <ChoiceRow
            testID="refund-policy"
            icon={HandCoins}
            title="Follow your policy"
            detail="Business cancellations are refunded in full."
            aside={money("policy")}
            selected={refund === "policy"}
            onPress={() => setRefund("policy")}
          />
          <ChoiceRow
            testID="refund-full"
            icon={Undo2}
            title="Full refund"
            aside={money("full")}
            selected={refund === "full"}
            onPress={() => setRefund("full")}
          />
          <ChoiceRow
            testID="refund-none"
            icon={Ban}
            title="No refund"
            detail="Keep what was paid."
            aside={fmt.money(0)}
            selected={refund === "none"}
            onPress={() => setRefund("none")}
          />
        </View>
      ) : null}
      <View style={[styles.preview, { backgroundColor: colors.surfaceSunken }]}>
        <Text variant="callout" tone="muted" testID="refund-preview">
          {preview.text}
        </Text>
      </View>
      <TextField
        label="Reason (optional)"
        hint={notify ? `Included in the email to the ${v("customer")}.` : "Kept in the history."}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="e.g. We have to close early today"
      />
      <Switch
        testID="cancel-notify"
        label={`Email the ${v("customer")}`}
        description={
          paid ? "Sends a cancellation email with the refund details." : "Sends a cancellation email."
        }
        value={notify}
        onValueChange={setNotify}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2], flexWrap: "wrap" },
  list: { gap: space[2] },
  preview: { padding: space[3], borderRadius: radius.lg },
});
