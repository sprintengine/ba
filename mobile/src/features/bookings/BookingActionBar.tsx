import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarClock, Check, UserX, X } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useApproveBooking, useSetBookingStatus } from "@shared/api/hooks/use-bookings";
import type { Booking, TerminalBookingStatus } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { bookingActionLayout, bookingCapabilities } from "@shared/dashboard/booking-capabilities";
import { useNow } from "@shared/hooks/use-now";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { CancelSheet } from "./CancelSheet";
import { DeclineSheet } from "./DeclineSheet";
import { haptics } from "./haptics";
import { RescheduleSheet } from "./RescheduleSheet";

const MARKED: Record<TerminalBookingStatus, string> = {
  completed: "Marked as completed",
  no_show: "Marked as no-show",
};

/** Approve a pending booking: optimistic in the cache (the hook), a toast and a haptic either way. */
export function useApprove(onApproved?: () => void) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const toast = useToast();
  const mutation = useApproveBooking(business.id);
  return {
    approve: async (id: string) => {
      try {
        await mutation.mutateAsync(id);
        haptics.success();
        toast.show(`${v("booking", { title: true })} approved`);
        onApproved?.();
      } catch (err) {
        haptics.error();
        toast.show(errorMessage(err), "danger");
      }
    },
    isApproving: (id?: string) => mutation.isPending && (id === undefined || mutation.variables === id),
  };
}

/**
 * What can be done with the booking now (`bookingCapabilities`, the website's rules): approve/decline, record the
 * outcome or correct it, reschedule, cancel. On a phone there's room for every action as a button, primary first.
 */
export function BookingActionBar({ booking: b }: { booking: Booking }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const toast = useToast();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState<"cancel" | "decline" | "reschedule" | null>(null);
  const approval = useApprove();
  const setStatus = useSetBookingStatus(business.id);
  const can = bookingCapabilities(b, now);
  const show = bookingActionLayout(b, can);

  const mark = async (status: TerminalBookingStatus) => {
    try {
      await setStatus.mutateAsync({ id: b.id, status });
      haptics.success();
      toast.show(MARKED[status]);
    } catch (err) {
      haptics.error();
      toast.show(errorMessage(err), "danger");
    }
  };
  const marking = (status: TerminalBookingStatus) =>
    setStatus.isPending && setStatus.variables.status === status;
  // The outcome flips optimistically: every outcome button waits for the request so a second tap can't undo it.
  const busy = setStatus.isPending;

  return (
    <View style={styles.root} testID="booking-actions">
      {show.idle ? (
        <Text tone="muted">
          {show.idle.closed ? `This ${v("booking")} is closed.` : "No actions available yet."}
        </Text>
      ) : null}
      {show.approveDecline ? (
        <>
          <Button
            testID="approve-booking"
            label="Approve"
            icon={Check}
            loading={approval.isApproving(b.id)}
            onPress={() => void approval.approve(b.id)}
          />
          <Button
            testID="decline-booking"
            label="Decline"
            variant="secondary"
            onPress={() => setSheet("decline")}
          />
        </>
      ) : null}
      {show.markOutcome ? (
        <>
          <Button
            testID="mark-completed"
            label="Completed"
            icon={Check}
            loading={marking("completed")}
            disabled={busy}
            onPress={() => void mark("completed")}
          />
          <Button
            testID="mark-no-show"
            label="No-show"
            icon={UserX}
            variant="secondary"
            loading={marking("no_show")}
            disabled={busy}
            onPress={() => void mark("no_show")}
          />
        </>
      ) : null}
      {show.correctOutcome ? (
        <Button
          testID="correct-outcome"
          label={show.correctOutcome === "no_show" ? "Mark no-show instead" : "Mark completed instead"}
          icon={show.correctOutcome === "no_show" ? UserX : Check}
          variant="secondary"
          loading={marking(show.correctOutcome)}
          disabled={busy}
          onPress={() => void mark(show.correctOutcome!)}
        />
      ) : null}
      {can.reschedule ? (
        <Button
          testID="reschedule-booking"
          label="Reschedule"
          icon={CalendarClock}
          variant="secondary"
          onPress={() => setSheet("reschedule")}
        />
      ) : null}
      {can.cancel ? (
        <Button
          testID="cancel-booking"
          label={`Cancel ${v("booking")}`}
          icon={X}
          variant="ghost"
          onPress={() => setSheet("cancel")}
        />
      ) : null}
      <CancelSheet booking={b} visible={sheet === "cancel"} onClose={() => setSheet(null)} />
      <DeclineSheet booking={b} visible={sheet === "decline"} onClose={() => setSheet(null)} />
      <RescheduleSheet booking={b} visible={sheet === "reschedule"} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center" },
});
