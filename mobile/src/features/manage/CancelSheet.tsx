import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import type { CustomerBooking } from "@shared/api/types";
import { refundCopy } from "@shared/booking/copy";
import { formatDateTime } from "@shared/format";
import { Button, Sheet, Text, TextField, useTheme, useToast } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { Callout } from "~/features/booking/Callout";

/**
 * "Cancel your booking?" (the website's CancelBookingDialog), shared by My bookings and the manage link: what would be
 * refunded (the server's preview, the business's policy), an optional reason, then `cancel` and a toast.
 */
export function CancelSheet({
  booking,
  bookingNoun = "booking",
  visible,
  onClose,
  cancel,
  successMessage,
}: {
  booking: CustomerBooking;
  bookingNoun?: string;
  visible: boolean;
  onClose: () => void;
  /** Cancels with the customer's reason (null when blank). */
  cancel: (reason: string | null) => Promise<unknown>;
  successMessage: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = booking.amountPaidCents - booking.amountRefundedCents > 0;

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };
  const confirm = async () => {
    setError(null);
    setPending(true);
    try {
      await cancel(reason.trim() || null);
      setReason("");
      onClose();
      toast.show(successMessage);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={`Cancel your ${bookingNoun}?`}
      testID="cancel-sheet"
      footer={
        <View style={styles.footer}>
          <Button
            testID="cancel-confirm"
            variant="destructive"
            size="lg"
            fullWidth
            loading={pending}
            label={`Cancel ${bookingNoun}`}
            onPress={() => void confirm()}
          />
          <Button
            variant="ghost"
            fullWidth
            label={`Keep ${bookingNoun}`}
            disabled={pending}
            onPress={close}
          />
        </View>
      }
    >
      <Text variant="body" tone="muted">
        {booking.service.name} on {formatDateTime(booking.start, booking.timezone)} with{" "}
        {booking.business.name}. This can't be undone.
      </Text>
      <View
        testID="refund-preview"
        style={
          paid
            ? [styles.refund, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]
            : undefined
        }
      >
        <Text variant="callout" tone={paid ? "default" : "muted"}>
          {refundCopy(booking)}
        </Text>
      </View>
      <TextField
        testID="cancel-reason"
        label="Reason (optional)"
        hint={`Shared with ${booking.business.name}.`}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        multiline
        placeholder="Something came up…"
      />
      {error ? (
        <Callout tone="danger" alert testID="cancel-error">
          {error}
        </Callout>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  refund: { borderRadius: radius.lg, borderWidth: borderWidth.hairline, padding: space[3] },
  footer: { gap: space[1] },
});
