"use client";

import { useEffect, useRef } from "react";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import type { StepId } from "@/lib/booking/steps";
import { useVocabulary } from "@/lib/vocabulary";
import { Spinner } from "@/components/ui/spinner";
import { BookingSummaryCard, MobileSummaryBar } from "./booking-summary";
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
  /** Business introduction; hidden on small screens after the first step to save space. */
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

  // Container queries, not viewport breakpoints: from an iPad mini's width up there is room for the summary
  // beside the steps (the action sticks to the bottom of the steps); narrower it is the phone layout, with the
  // summary and the action in a bottom bar.
  return (
    <div className="@container">
      {intro && <div className={flow.stepIndex > 0 ? "@max-2xl:hidden" : undefined}>{intro}</div>}
      <div className="grid gap-8 @2xl:grid-cols-[minmax(0,1fr)_16rem] @2xl:gap-6 @4xl:grid-cols-[minmax(0,1fr)_21rem] @4xl:gap-12">
        <div ref={topRef} className="flex min-w-0 scroll-mt-24 flex-col gap-6 pb-32 @2xl:pb-0">
          <StepProgress index={flow.stepIndex} total={flow.stepTotal.total} />
          <FlowStep flow={flow} />
          {action && (
            <div className="sticky bottom-0 z-10 -mx-2 hidden justify-end bg-background/85 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl @2xl:flex">
              {action}
            </div>
          )}
        </div>
        <div className="hidden @2xl:block">
          <div className="sticky top-24">
            <BookingSummaryCard {...summaryProps} />
          </div>
        </div>
      </div>
      <MobileSummaryBar
        {...summaryProps}
        action={action}
        actionOnly={flow.step === "review"}
        className="@2xl:hidden"
      />
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
