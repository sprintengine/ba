"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, LinkIcon } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import {
  useCancelManagedBooking,
  useConfirmManagedPayment,
  useManagedAvailabilityWindows,
  useManagedNextSlot,
  useManagedBooking,
  usePayManagedBooking,
  usePublicBusiness,
  useRescheduleManagedBooking,
} from "@/lib/api/hooks";
import type { ManagedBooking, PublicBusiness } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { bookingMinutes, hasEnded } from "@/lib/booking/booking";
import {
  checkoutSessionFrom,
  CONFIRM_POLL_LIMIT_MS,
  manageContextFrom,
  manageHero,
  type ManageContext,
} from "@/lib/booking/manage";
import { formatDuration } from "@/lib/format";
import { useCountdown, useNow } from "@/lib/hooks/use-now";
import { isBlockingStatus } from "@/lib/status";
import { vocab } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PublicBookingShell, shellThemeProps } from "@/components/shells/public-booking-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { CancelBookingDialog } from "./cancel-booking";
import { ManageBookingCard } from "./manage-booking-card";
import { ManageHeroBanner } from "./manage-hero";
import { CreateAccountPrompt, SaveLinkCard } from "./manage-prompts";
import { ReschedulePanel, useRescheduleState, type RescheduleState } from "./reschedule";

/** Guest "manage your booking" page (`/manage/[token]`), in the business's branded shell. */
export function ManageBookingPage({ token }: { token: string }) {
  const params = useSearchParams();
  const context = manageContextFrom(new URLSearchParams(params.toString()));
  const [held, setHeld] = useState(context === "paid");
  const confirming = useConfirmOnReturn(
    token,
    context,
    checkoutSessionFrom(new URLSearchParams(params.toString())),
    held,
  );
  const booking = useManagedBooking(token, {
    // After a payment redirect, read it again for a while until the payment is confirmed (then the page says it is
    // taking longer, and the email follows).
    refetchInterval: (q) => (confirming.polling() && q.state.data?.status === "held" ? 2000 : false),
  });
  const stillHeld = booking.data ? booking.data.status === "held" : context === "paid";
  if (stillHeld !== held) setHeld(stillHeld);
  const slug = booking.data?.business.slug ?? "";
  const business = usePublicBusiness(slug, { retry: false, staleTime: 5 * 60_000 });

  if (booking.isError) {
    return (
      <PublicBookingShell business={null} width="wide">
        {booking.error.isNotFound ? (
          <EmptyState
            size="lg"
            headingLevel={1}
            icon={<LinkIcon />}
            title="This booking link isn't valid"
            description="Manage links stop working after the appointment, or the link may be incomplete. Check the latest email from the business, or contact them directly."
            action={
              <Button asChild variant="secondary">
                <Link href="/my/bookings">Sign in to see your bookings</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={booking.error} onRetry={() => booking.refetch()} headingLevel={1} />
        )}
      </PublicBookingShell>
    );
  }
  if (!booking.data) {
    return (
      <PublicBookingShell business={null} loading>
        <div className="flex flex-col gap-6" role="status" aria-busy aria-label="Loading">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </PublicBookingShell>
    );
  }

  const b = booking.data;
  const pb = business.data ?? null;
  return (
    <PublicBookingShell
      business={{
        ...b.business,
        // The public business's branding carries the portal style (resolved to the industry default when unset).
        branding: pb?.branding ?? b.business.branding,
        vocabulary: pb?.vocabulary ?? null,
        showBadge: pb?.showBadge ?? false,
        // The site's theme, like the booking flow that led here.
        site: pb?.site ?? null,
      }}
      showCover={false}
      headerAction={
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${b.business.slug}`}>Book again</Link>
        </Button>
      }
    >
      <ManageBookingView
        token={token}
        booking={b}
        business={pb}
        context={context}
        confirmingTooLong={confirming.tooLong}
      />
    </PublicBookingShell>
  );
}

/**
 * Back from Checkout: asks the server to confirm the payment of [sessionId] at once (it reads it from Stripe), and keeps
 * polling for [CONFIRM_POLL_LIMIT_MS] at most. `tooLong` once that has passed without a confirmation.
 */
function useConfirmOnReturn(token: string, context: ManageContext, sessionId: string | null, held: boolean) {
  const confirm = useConfirmManagedPayment(token);
  const { mutate } = confirm;
  const asked = useRef(false);
  const [since] = useState(() => Date.now());
  // Ticks only while there is something to wait for.
  const now = useNow(context === "paid" && held ? 5_000 : null);
  useEffect(() => {
    if (asked.current || context !== "paid" || !sessionId) return;
    asked.current = true;
    mutate(sessionId);
  }, [context, sessionId, mutate]);
  const tooLong = context === "paid" && now.getTime() - since >= CONFIRM_POLL_LIMIT_MS;
  return { polling: () => context === "paid" && Date.now() - since < CONFIRM_POLL_LIMIT_MS, tooLong };
}

function ManageBookingView({
  token,
  booking: b,
  business,
  context,
  confirmingTooLong,
}: {
  token: string;
  booking: ManagedBooking;
  business: PublicBusiness | null;
  context: ManageContext;
  confirmingTooLong: boolean;
}) {
  const noun = vocab(business?.vocabulary, "booking");
  const remaining = useCountdown(b.status === "held" ? b.holdExpiresAt : null);
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [cancelOpen, setCancelOpen] = useState(false);
  const manageUrl = useManageUrl(token);
  const cancel = useCancelManagedBooking(token);
  const pay = usePayManagedBooking(token);
  // Kept here so a picked date survives going back to the booking and returning.
  const rs = useRescheduleState(b.timezone, business?.policies.maxAdvanceDays ?? 90);
  const now = useNow();
  const active = isBlockingStatus(b.status) && !hasEnded(b, now);

  const onPay = async () => {
    try {
      const { checkoutUrl } = await pay.mutateAsync();
      window.location.assign(checkoutUrl);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (mode === "reschedule") {
    return (
      <ManageReschedule token={token} booking={b} noun={noun} state={rs} onClose={() => setMode("view")} />
    );
  }

  const hero = manageHero(b, context, remaining, confirmingTooLong);
  return (
    <div className="flex flex-col gap-6">
      {/* The page's heading when there is no headline to show (a plain revisit). */}
      {hero.kind === "none" && <h1 className="sr-only">Your {noun}</h1>}
      <ManageHeroBanner
        hero={hero}
        booking={b}
        knowsBusiness={business !== null}
        remaining={remaining}
        noun={noun}
        onPay={onPay}
        paying={pay.isPending}
      />
      <ManageBookingCard
        booking={b}
        noun={noun}
        active={active}
        manageUrl={manageUrl}
        onReschedule={() => setMode("reschedule")}
        onCancel={() => setCancelOpen(true)}
      />
      {/* Keep the link / account: offered on the first visit, straight after booking or paying. */}
      {active && (context === "booked" || context === "paid") && manageUrl && (
        <SaveLinkCard url={manageUrl} noun={noun} />
      )}
      {isLoaded && !isSignedIn && (
        <CreateAccountPrompt
          bookingsNoun={vocab(business?.vocabulary, "bookings")}
          email={b.customer.email}
        />
      )}
      <CancelBookingDialog
        booking={b}
        bookingNoun={noun}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        cancel={(reason) => cancel.mutateAsync({ reason })}
        successMessage={`Your ${noun} was cancelled`}
        themeProps={shellThemeProps({
          branding: business?.branding ?? b.business.branding,
          site: business?.site ?? null,
        })}
      />
    </div>
  );
}

/** This page's absolute URL (for the calendar event and "copy link"); the origin is only known in the browser. */
function useManageUrl(token: string): string | null {
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
    setManageUrl(`${window.location.origin}/manage/${token}`);
  }, [token]);
  return manageUrl;
}

/** "Choose a new time": the picker on this booking's own availability (same service and options). */
function ManageReschedule({
  token,
  booking: b,
  noun,
  state,
  onClose,
}: {
  token: string;
  booking: ManagedBooking;
  noun: string;
  state: RescheduleState;
  onClose: () => void;
}) {
  const reschedule = useRescheduleManagedBooking(token);
  const availability = useManagedAvailabilityWindows(token, state.windows);
  const next = useManagedNextSlot(token, state.nextWindows, state.after, availability.nextAvailableOnly);
  return (
    <div className="flex animate-rise flex-col gap-6">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onClose}
          className="-my-2.5 -ml-1 inline-flex h-11 w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to your {noun}
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new time</h1>
        <p className="text-sm text-muted-foreground">
          {b.service.name}
          {b.option && ` · ${b.option.name}`} · {formatDuration(bookingMinutes(b))}
        </p>
      </div>
      <ReschedulePanel
        booking={b}
        state={state}
        availability={availability}
        next={next}
        pending={reschedule.isPending}
        reschedule={(start) => reschedule.mutateAsync({ start })}
        onDone={onClose}
        onCancel={onClose}
      />
    </div>
  );
}
