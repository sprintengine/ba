import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  CreditCard,
  Hourglass,
  RotateCcw,
} from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useCancelMyBooking, useMyBookings, usePayMyBooking } from "@shared/api/hooks/use-me";
import type { CustomerBooking } from "@shared/api/types";
import { amountDueCents, hasEnded } from "@shared/booking/booking";
import { formatCountdown } from "@shared/booking/copy";
import { formatMoney } from "@shared/format";
import { useCountdown, useNow } from "@shared/hooks/use-now";
import { isBlockingStatus, isReleasedStatus } from "@shared/status";
import { Button, Card, Icon, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { openCheckout } from "~/features/booking/checkout";
import { addToCalendar } from "~/features/manage/calendar";
import { CancelSheet } from "~/features/manage/CancelSheet";
import { CHECKING_MS, POLL_MS } from "~/features/manage/manage-context";
import { MyRescheduleSheet } from "~/features/manage/Reschedule";

/**
 * What can be done with one of my bookings (the website's My bookings card actions): pay while it's held (with the
 * hold's countdown), add to the calendar, reschedule, cancel; book again once it's over.
 */
export function BookingActions({ booking: b }: { booking: CustomerBooking }) {
  const toast = useToast();
  const [sheet, setSheet] = useState<"reschedule" | "cancel" | null>(null);
  const [checking, setChecking] = useState(false);
  const cancel = useCancelMyBooking();
  const pay = usePayMyBooking();
  // Back from Checkout: read My bookings again for a few seconds until the payment shows.
  useMyBookings({ refetchInterval: checking && b.status === "held" ? POLL_MS : false });
  useEffect(() => {
    if (!checking) return;
    const id = setTimeout(() => setChecking(false), CHECKING_MS);
    return () => clearTimeout(id);
  }, [checking]);
  const status = b.status;
  useEffect(() => {
    if (!checking || status === "held") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the payment arrived while we were looking
    setChecking(false);
    toast.show("Payment received. You're booked.");
  }, [checking, status, toast]);

  const remaining = useCountdown(b.status === "held" ? b.holdExpiresAt : null);
  const awaitingPayment = b.status === "held" && remaining !== null && remaining > 0;
  const now = useNow();
  const inactive = hasEnded(b, now) || isReleasedStatus(b.status);
  const accepted = isBlockingStatus(b.status) && b.status !== "held";

  if (inactive) {
    return (
      <Card padding={2}>
        <Button
          testID="book-again"
          variant="ghost"
          icon={RotateCcw}
          label={`Book again with ${b.business.name}`}
          onPress={() => router.push({ pathname: "/[slug]", params: { slug: b.business.slug } })}
        />
      </Card>
    );
  }
  if (!awaitingPayment && !b.canCancel && !b.canReschedule && !accepted) return null;

  const onPay = async () => {
    try {
      const { checkoutUrl } = await pay.mutateAsync(b.id);
      await openCheckout(checkoutUrl, null);
      setChecking(true);
    } catch (err) {
      toast.show(errorMessage(err), "danger");
    }
  };
  const due = amountDueCents(b);

  return (
    <Card testID="booking-actions">
      {awaitingPayment ? (
        <View style={styles.hold}>
          <Icon icon={Hourglass} size={16} color="warningSoftForeground" />
          <Text variant="callout" tone="warning" numeric style={styles.flex}>
            Held for {formatCountdown(remaining)}. Pay now to confirm it.
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {awaitingPayment ? (
          <Button
            testID="booking-pay"
            variant="primary"
            icon={CreditCard}
            loading={pay.isPending}
            label={`Pay now${due > 0 ? ` · ${formatMoney(due, b.currency)}` : ""}`}
            onPress={() => void onPay()}
          />
        ) : null}
        {b.status !== "held" ? (
          <Button
            testID="booking-calendar"
            variant="secondary"
            icon={CalendarPlus}
            label="Add to calendar"
            onPress={() =>
              void addToCalendar(b).then((r) => {
                if (r === "saved") toast.show("Added to your calendar");
                if (r === "failed") toast.show("We couldn't open your calendar.", "danger");
              })
            }
          />
        ) : null}
        {b.canReschedule ? (
          <Button
            testID="booking-reschedule"
            variant="secondary"
            icon={CalendarClock}
            label="Reschedule"
            onPress={() => setSheet("reschedule")}
          />
        ) : null}
        {b.canCancel ? (
          <Button
            testID="booking-cancel"
            variant="ghost"
            icon={CalendarX2}
            label="Cancel"
            accessibilityLabel="Cancel booking"
            onPress={() => setSheet("cancel")}
          />
        ) : null}
      </View>
      <MyRescheduleSheet booking={b} visible={sheet === "reschedule"} onClose={() => setSheet(null)} />
      <CancelSheet
        booking={b}
        visible={sheet === "cancel"}
        onClose={() => setSheet(null)}
        cancel={(reason) => cancel.mutateAsync({ id: b.id, input: { reason } })}
        successMessage={`${b.service.name} with ${b.business.name} was cancelled`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  hold: { flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[3] },
  flex: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
