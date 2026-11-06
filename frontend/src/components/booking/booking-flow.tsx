"use client";

import { useEffect, useRef } from "react";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import type { StepId } from "@/lib/booking/steps";
import { useVocabulary } from "@/lib/vocabulary";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BookingPromises, BookingSummaryCard, MobileSummaryBar } from "./booking-summary";
import { FlowStep, flowStepAction } from "./flow-step";
import { StepProgress } from "./steps";
import { useBookingAgentTools } from "./use-booking-agent-tools";
import { useBookingFlow } from "./use-booking-flow";

/**
 * The public booking flow (`/[slug]/book`): group → service → extras → resource → time → details → review,
 * with the steps that apply. State lives in the URL (see lib/booking/url.ts); a summary card follows along
 * (a bottom bar on mobile). In browsers with WebMCP, an AI agent can drive it too (`booking-agent-tools.ts`).
 */
export function BookingFlow({
  business,
  services,
  intro,
}: {
  business: PublicBusiness;
  services: PublicService[];
  /** Who the business is: beside every step with room, above the first without. */
  intro?: React.ReactNode;
}) {
  const flow = useBookingFlow(business, services);
  useBookingAgentTools(flow);
  const { v } = useVocabulary();
  const topRef = useScrollToTopOnChange(flow.step);
  const action = flowStepAction(flow, v);
  const summaryProps = {
    business,
    service: flow.service,
    selection: flow.sel,
    quote: flow.quote,
    steps: flow.steps,
    takesOnlinePayment: services.some((s) => s.paymentMode === "full" || s.paymentMode === "deposit"),
    onEdit: (s: StepId) => flow.goTo(s),
  };

  const reviewing = flow.step === "review";
  const first = flow.stepIndex === 0;
  // Container queries, not viewport breakpoints: with room, the business stands on the left through every step, with
  // the booking building up under it, and the step on the right; narrower it is the phone layout, with the business
  // above the first step and the summary and the action in a bottom bar.
  return (
    <div className="@container">
      <div className="grid gap-6 @4xl:grid-cols-[19rem_minmax(0,1fr)] @4xl:gap-12">
        <aside
          aria-label={business.name}
          className={cn(
            "flex min-w-0 flex-col gap-6 @4xl:sticky @4xl:top-24 @4xl:self-start",
            !first && "hidden @4xl:flex",
          )}
        >
          {intro}
          {/* The receipt stays put to the end, so the total is in view when it's time to confirm. */}
          {flow.service && (
            <div className="hidden border-t border-border pt-5 @4xl:block">
              <BookingSummaryCard {...summaryProps} />
            </div>
          )}
        </aside>
        <div ref={topRef} className="flex min-w-0 scroll-mt-24 flex-col gap-6 pb-32 @4xl:pb-0">
          {/* While the number of steps depends on what's chosen, a bar would only promise a length it can't keep. */}
          {flow.stepTotal.known && <StepProgress index={flow.stepIndex} total={flow.stepTotal.total} />}
          <FlowStep flow={flow} />
          {!flow.service && <BookingPromises {...summaryProps} />}
          {action && (
            <div className="sticky bottom-0 z-10 -mx-2 hidden justify-end border-t border-border-subtle bg-background px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] @4xl:flex">
              {action}
            </div>
          )}
        </div>
      </div>
      <MobileSummaryBar {...summaryProps} action={action} actionOnly={reviewing} className="@4xl:hidden" />
      {flow.submit.redirecting && <RedirectOverlay />}
    </div>
  );
}

/** Scrolls the returned element's top into view when `key` changes (not on mount), if it is above the fold. */
function useScrollToTopOnChange(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const top = ref.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [key]);
  return ref;
}

function RedirectOverlay() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm"
    >
      <Spinner className="size-6" label="Redirecting" />
      <div className="text-center">
        <p className="font-medium">Taking you to secure payment…</p>
        <p className="mt-1 text-sm text-muted-foreground">Your time is held while you pay.</p>
      </div>
    </div>
  );
}
