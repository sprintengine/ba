"use client";

import { useState } from "react";
import { CalendarClock, Check, MoreHorizontal, UserX, X } from "lucide-react";
import type { Booking, TerminalBookingStatus } from "@/lib/api/types";
import { useSetBookingStatus } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { bookingActionLayout, bookingCapabilities } from "@/lib/dashboard/booking-capabilities";
import { useNow } from "@/lib/hooks/use-now";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { withToast } from "@/components/common/with-toast";
import { CancelBookingDialog } from "./cancel-dialog";
import { DeclineBookingDialog } from "./decline-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { useApproveAction } from "./use-approve-action";

const MARKED: Record<TerminalBookingStatus, string> = {
  completed: "Marked as completed",
  no_show: "Marked as no-show",
};

/**
 * The contextual action bar for a booking: approve/decline, record the outcome, reschedule, cancel. What is offered
 * comes from `bookingCapabilities`; approve and mark update the cached detail optimistically (in the hooks).
 */
export function BookingActionsBar({ booking: b, onDone }: { booking: Booking; onDone?: () => void }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const now = useNow(30_000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const approval = useApproveAction(onDone);
  const setStatus = useSetBookingStatus(business.id);
  const can = bookingCapabilities(b, now);
  const show = bookingActionLayout(b, can);

  const mark = async (status: TerminalBookingStatus) => {
    if (await withToast(() => setStatus.mutateAsync({ id: b.id, status }), MARKED[status])) onDone?.();
  };
  const marking = (status: TerminalBookingStatus) =>
    setStatus.isPending && setStatus.variables.status === status;
  // The outcome flips optimistically, so a second click while the first is in flight would hit the other button
  // (or "… instead") and record the opposite outcome: every outcome button waits for the request.
  const outcomeBusy = setStatus.isPending;

  return (
    <>
      {show.idle && (
        <p className="mr-auto self-center text-sm text-muted-foreground">
          {show.idle.closed ? `This ${v("booking")} is closed.` : `No actions available yet.`}
        </p>
      )}
      {show.approveDecline && (
        <>
          <Button variant="primary" loading={approval.isApproving()} onClick={() => approval.approve(b.id)}>
            <Check /> Approve
          </Button>
          <Button variant="secondary" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
        </>
      )}
      {show.markOutcome && (
        <>
          <Button
            variant="primary"
            loading={marking("completed")}
            disabled={outcomeBusy}
            onClick={() => mark("completed")}
          >
            <Check /> Mark as completed
          </Button>
          <Button
            variant="secondary"
            loading={marking("no_show")}
            disabled={outcomeBusy}
            onClick={() => mark("no_show")}
          >
            <UserX /> Mark as no-show
          </Button>
        </>
      )}
      {show.correctOutcome && (
        <CorrectOutcomeButton
          to={show.correctOutcome}
          loading={marking(show.correctOutcome)}
          disabled={outcomeBusy}
          onClick={mark}
        />
      )}
      {show.rescheduleButton && (
        <Button variant="secondary" onClick={() => setRescheduleOpen(true)}>
          <CalendarClock /> Reschedule
        </Button>
      )}
      {show.cancelButton && (
        <Button variant="danger-soft" onClick={() => setCancelOpen(true)}>
          Cancel {v("booking")}
        </Button>
      )}
      {show.overflowMenu && (
        <MoreActions
          reschedule={can.reschedule}
          cancel={can.cancel}
          onReschedule={() => setRescheduleOpen(true)}
          onCancel={() => setCancelOpen(true)}
        />
      )}
      <CancelBookingDialog booking={b} open={cancelOpen} onOpenChange={setCancelOpen} />
      <DeclineBookingDialog
        booking={b}
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        onDeclined={onDone}
      />
      <RescheduleDialog booking={b} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
    </>
  );
}

/** "Change to no-show" / "Change to completed" for a booking whose outcome is already recorded. */
function CorrectOutcomeButton({
  to,
  loading,
  disabled,
  onClick,
}: {
  to: TerminalBookingStatus;
  loading: boolean;
  disabled: boolean;
  onClick: (status: TerminalBookingStatus) => void;
}) {
  return (
    <Button variant="secondary" loading={loading} disabled={disabled} onClick={() => onClick(to)}>
      {to === "no_show" ? (
        <>
          <UserX /> Change to no-show
        </>
      ) : (
        <>
          <Check /> Change to completed
        </>
      )}
    </Button>
  );
}

/** Reschedule and cancel, tucked away next to the primary actions. */
function MoreActions({
  reschedule,
  cancel,
  onReschedule,
  onCancel,
}: {
  reschedule: boolean;
  cancel: boolean;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const { v } = useVocabulary();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="secondary" size="md" label="More actions">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {reschedule && (
          <DropdownMenuItem onSelect={onReschedule}>
            <CalendarClock /> Reschedule
          </DropdownMenuItem>
        )}
        {reschedule && cancel && <DropdownMenuSeparator />}
        {cancel && (
          <DropdownMenuItem destructive onSelect={onCancel}>
            <X /> Cancel {v("booking")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
