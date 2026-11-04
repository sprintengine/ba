import { MailOpen } from "lucide-react";
import type { PendingInvitation } from "@/lib/api/types";

/**
 * A team invitation on My bookings. Invitations for the user's email are accepted when /v1/me loads, so one still
 * pending is waiting for a seat (the team is at its plan's member limit): accepting it here could only fail. It is
 * accepted automatically once the business makes room.
 */
export function InvitationBanner({ invitation }: { invitation: PendingInvitation }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-soft p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand shadow-xs">
        <MailOpen className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-brand-soft-foreground">
          You&apos;re invited to join {invitation.businessName}
        </p>
        <p className="text-sm text-brand-soft-foreground/80">
          As {invitation.role === "admin" ? "an admin" : `a ${invitation.role}`}, but their team is full on
          its current plan. You&apos;ll join automatically once they free up a seat or upgrade.
        </p>
      </div>
    </div>
  );
}
