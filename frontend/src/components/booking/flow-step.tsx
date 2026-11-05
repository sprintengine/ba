"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert, Lock } from "lucide-react";
import type { PublicService } from "@/lib/api/types";
import { signInUrl } from "@/lib/auth/components";
import { extrasStepDescription, submitLabel } from "@/lib/booking/copy";
import type { Quote } from "@/lib/booking/quote";
import { servicesForGroup } from "@/lib/booking/services";
import { isStepComplete, nextStep, previousStep } from "@/lib/booking/steps";
import { formatDuration, toPlainDate, toTimeOfDay } from "@/lib/format";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { DETAILS_FORM_ID, DetailsStep } from "./details-step";
import { ReviewStep } from "./review-step";
import { NextSlotPicker } from "./next-slot-picker";
import { SlotPicker } from "./slot-picker";
import { ExtrasStep, GroupStep, ResourceStep, ServiceStep, StepHeader } from "./steps";
import type { BookingFlowModel } from "./use-booking-flow";

type Vocab = ReturnType<typeof useVocabulary>["v"];
type StepView = { title: React.ReactNode; description?: React.ReactNode; content: React.ReactNode };

/** The current step: its header (with Back) and its content. */
export function FlowStep({ flow }: { flow: BookingFlowModel }) {
  const { v } = useVocabulary();
  const view = stepView(flow, v);
  const back = previousStep(flow.step, flow.steps);
  const headingRef = useFocusOnChange(flow.step);
  return (
    <>
      <StepHeader
        headingRef={headingRef}
        index={flow.stepIndex}
        total={flow.stepTotal.known ? flow.stepTotal.total : null}
        title={view.title}
        description={view.description ?? null}
        onBack={back ? () => flow.goTo(back) : null}
      />
      <div key={flow.step} className="animate-rise">
        {view.content}
      </div>
    </>
  );
}

/**
 * Focuses the returned heading when `key` changes (not on mount): the content it heads was replaced, so keyboard
 * and screen reader users carry on from the new step rather than from the top of the page.
 */
function useFocusOnChange(key: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  const shown = useRef(key);
  useEffect(() => {
    if (shown.current === key) return;
    shown.current = key;
    ref.current?.focus({ preventScroll: true });
  }, [key]);
  return ref;
}

function stepView(flow: BookingFlowModel, v: Vocab): StepView {
  const { business, sel } = flow;
  switch (flow.step) {
    case "group":
      return {
        title: "Which best describes you?",
        description: "We'll show you the options and times that apply.",
        content: (
          <GroupStep
            groups={business.customerGroups}
            value={sel.groupId}
            onSelect={(groupId) => flow.choose({ type: "group", groupId }, true)}
          />
        ),
      };
    case "service":
      return serviceView(flow);
    default:
      // Every later step has a service (the flow never resolves past "service" without one).
      return flow.service && flow.quote
        ? chosenServiceView(flow, flow.service, flow.quote, v)
        : serviceView(flow);
  }
}

function serviceView(flow: BookingFlowModel): StepView {
  return {
    title: "Choose a service",
    content: (
      <ServiceStep
        services={servicesForGroup(flow.services, flow.sel.groupId)}
        currency={flow.business.currency}
        locale={flow.business.locale}
        value={flow.sel.serviceId}
        onSelect={(s) => flow.choose({ type: "service", service: s }, true)}
      />
    ),
  };
}

function chosenServiceView(flow: BookingFlowModel, service: PublicService, quote: Quote, v: Vocab): StepView {
  const { business, sel } = flow;
  switch (flow.step) {
    case "extras":
      return {
        title: service.name,
        description: extrasStepDescription(service),
        content: (
          <ExtrasStep
            service={service}
            currency={business.currency}
            locale={business.locale}
            optionId={sel.optionId}
            addonIds={sel.addonIds}
            onOption={(optionId) => flow.choose({ type: "option", optionId }, false)}
            onToggleAddon={(addonId) => flow.choose({ type: "toggleAddon", addonId }, false)}
          />
        ),
      };
    case "resource":
      return resourceView(flow, service, v);
    case "time":
      return {
        title: "Pick a time",
        description: `${service.name} · ${formatDuration(quote.durationMinutes)}`,
        content: <TimeStep flow={flow} />,
      };
    case "details":
      return {
        title: "Your details",
        content: <FlowDetailsStep flow={flow} />,
      };
    case "review":
      return {
        title: service.requiresApproval ? "Review your request" : "Review and confirm",
        content: (
          <ReviewStep
            business={business}
            service={service}
            selection={sel}
            quote={quote}
            payment={flow.payment}
            details={flow.details.form.getValues()}
            questions={flow.details.questions}
            onEdit={flow.goTo}
            alert={flow.submit.alert}
          />
        ),
      };
    case "group":
    case "service":
      return serviceView(flow);
  }
}

function resourceView(flow: BookingFlowModel, service: PublicService, v: Vocab): StepView {
  const requirement = service.selectableRequirement;
  const label = requirement?.label || v("resource", { title: true });
  return {
    title: `Choose your ${label.toLowerCase()}`,
    description: flow.business.policies.nextAvailableOnly
      ? "Or choose “Any” for the earliest time with anyone."
      : "Or choose “Any” to see every available time.",
    content: requirement && (
      <ResourceStep
        requirement={requirement}
        value={flow.sel.resource}
        onSelect={(resource) => flow.choose({ type: "resource", resource }, true)}
      />
    ),
  };
}

function TimeStep({ flow }: { flow: BookingFlowModel }) {
  const { business, time } = flow;
  const notice = time.conflict && (
    <div
      role="alert"
      className="flex animate-rise gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm text-warning-soft-foreground"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{time.conflict}</p>
    </div>
  );
  if (time.nextOnly) {
    const tz = business.timezone;
    return (
      <NextSlotPicker
        timeZone={tz}
        locale={business.locale}
        currency={business.currency}
        next={time.next}
        stepped={time.after.value !== null}
        selected={!!time.chosenSlot}
        chooseLabel={time.chosenSlot ? "Continue with this time" : "Book this time"}
        onChoose={(slot) => time.onSelectSlot(slot, toPlainDate(slot.start, tz), toTimeOfDay(slot.start, tz))}
        onLater={(slot) => {
          time.setConflict(null);
          time.after.later(slot);
        }}
        onEarliest={time.after.earliest}
        notice={notice}
      />
    );
  }
  return (
    <SlotPicker
      timeZone={business.timezone}
      locale={business.locale}
      currency={business.currency}
      min={time.today}
      max={time.maxDate}
      month={time.month}
      onMonthChange={time.setMonth}
      date={flow.sel.date}
      onDateChange={time.onDateChange}
      onWeekChange={time.onWeekChange}
      selectedTime={flow.sel.time}
      onSelectSlot={time.onSelectSlot}
      availability={time.availability}
      notice={notice}
    />
  );
}

function FlowDetailsStep({ flow }: { flow: BookingFlowModel }) {
  const { business, details } = flow;
  // From the router, not `window`, so the server render and hydration agree.
  const query = useSearchParams().toString();
  const signInHref = signInUrl(query ? `${flow.pathname}?${query}` : flow.pathname);
  return (
    <DetailsStep
      form={details.form}
      onSubmit={() => {
        details.setComplete(true);
        flow.navigate({ ...flow.sel, step: "review" }, "push");
      }}
      questions={details.questions}
      requirePhone={details.requirePhone}
      businessName={business.name}
      signedInAs={details.signedInAs}
      signInHref={signInHref}
    />
  );
}

/** The step's primary action (desktop inline, mobile in the bottom bar); null when the step has none. */
export function flowStepAction(flow: BookingFlowModel, v: Vocab): React.ReactNode {
  const { step, steps } = flow;
  if (step === "extras") {
    return (
      <Button
        variant="primary"
        size="lg"
        disabled={!isStepComplete(step, flow.sel, flow.ctx)}
        onClick={() => flow.goTo(nextStep(step, steps))}
      >
        Continue <ArrowRight />
      </Button>
    );
  }
  if (step === "details") {
    return (
      <Button variant="primary" size="lg" type="submit" form={DETAILS_FORM_ID}>
        Review <ArrowRight />
      </Button>
    );
  }
  if (step === "review")
    return flow.service && flow.quote ? submitAction(flow, flow.service, flow.quote, v) : null;
  if (step === "time" || !isStepComplete(step, flow.sel, flow.ctx)) return null;
  return (
    <Button variant="secondary" size="lg" onClick={() => flow.goTo(nextStep(step, steps))}>
      Continue <ArrowRight />
    </Button>
  );
}

function submitAction(flow: BookingFlowModel, service: PublicService, quote: Quote, v: Vocab) {
  return (
    <Button variant="primary" size="lg" loading={flow.submit.pending} onClick={flow.submit.submit}>
      {(quote.mode === "full" || quote.mode === "deposit") && <Lock />}
      {submitLabel(service, quote, flow.business.currency, flow.business.locale, v("booking"))}
    </Button>
  );
}
