"use client";

import { useApproveBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { withToast } from "@/components/common/with-toast";

/**
 * Approving a booking that waits for approval, as the booking's action bar and the overview's approvals card do it:
 * "Booking approved" (in the business's words) or the error as a toast, then `onApproved`.
 */
export function useApproveAction(onApproved?: () => void) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const mutation = useApproveBooking(business.id);
  return {
    approve: async (bookingId: string) => {
      const ok = await withToast(
        () => mutation.mutateAsync(bookingId),
        `${v("booking", { title: true })} approved`,
      );
      if (ok) onApproved?.();
    },
    /** Whether an approval is in flight: of [bookingId] when given, else of any booking. */
    isApproving: (bookingId?: string) =>
      mutation.isPending && (bookingId === undefined || mutation.variables === bookingId),
  };
}
