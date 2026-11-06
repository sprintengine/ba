"use client";

import Link from "next/link";
import { CircleAlert, CreditCard, Lock, Shield, Store } from "lucide-react";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { bookingEnd } from "@/lib/booking/booking";
import { cancellationSummary, paymentModeCopy } from "@/lib/booking/copy";
import { isAnswered, type DetailsValues, type Question } from "@/lib/booking/details-schema";
import type { BookingAlert } from "@/lib/booking/errors";
import type { Quote } from "@/lib/booking/quote";
import { ANY_RESOURCE, chosenExtras, resourceChoiceName, type Selection } from "@/lib/booking/selection";
import type { StepId } from "@/lib/booking/steps";
import { formatDate, formatDuration, formatTimeRange, timeZoneLabel, zonedToIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Badge } from "@/components/ui/badge";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { QuoteBreakdown } from "./quote-breakdown";
import type { PaymentChoice } from "./use-booking-flow";

/** The last step: everything chosen, each with "Change", the price breakdown and the policies. */
export function ReviewStep({
  business,
  service,
  selection,
  quote,
  payment,
  details,
  questions,
  onEdit,
  alert,
}: {
  business: PublicBusiness;
  service: PublicService;
  selection: Selection;
  quote: Quote;
  payment: PaymentChoice;
  details: DetailsValues;
  questions: Question[];
  onEdit: (step: StepId) => void;
  alert: BookingAlert | null;
}) {
  const { v } = useVocabulary();
  return (
    <div className="flex flex-col gap-5">
      {alert && <AlertBanner alert={alert} />}
      <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface px-4 shadow-xs sm:px-5 dark:bg-surface-raised">
        {/* The whole booking in one place, in the same order on every screen, with the final action under it. */}
        <WhenSection business={business} selection={selection} quote={quote} onEdit={() => onEdit("time")} />
        <Section title="What" onEdit={() => onEdit("service")}>
          <WhatSummary business={business} service={service} selection={selection} />
        </Section>
        <Section title="Your details" onEdit={() => onEdit("details")}>
          <DetailsSummary details={details} questions={questions} />
        </Section>
        <Section title="Payment">
          {payment.offered && <HowToPay payment={payment} />}
          <PaymentSummary business={business} service={service} quote={quote} />
        </Section>
      </div>
      <p className="text-xs text-muted-foreground">
        Your details are shared with {business.name} to manage your {v("booking")}. See our{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}

function AlertBanner({ alert }: { alert: BookingAlert }) {
  return (
    <div
      role="alert"
      className={
        alert.tone === "danger"
          ? "flex animate-rise gap-3 rounded-xl border border-danger-border bg-danger-soft p-4 text-danger-soft-foreground"
          : "flex animate-rise gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-warning-soft-foreground"
      }
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{alert.title}</p>
        <div className="opacity-90">{alert.body}</div>
      </div>
    </div>
  );
}

function WhenSection({
  business,
  selection,
  quote,
  onEdit,
}: {
  business: PublicBusiness;
  selection: Selection;
  quote: Quote;
  onEdit: () => void;
}) {
  // The review step is only reached with a time chosen.
  if (!selection.date || !selection.time) return null;
  const tz = business.timezone;
  const start = zonedToIso(selection.date, selection.time, tz);
  return (
    <Section title="When" onEdit={onEdit}>
      <p className="text-base font-semibold tracking-tight">
        {formatDate(selection.date, tz, "long", business.locale)}
      </p>
      <p className="tnum text-sm text-muted-foreground">
        {formatTimeRange(start, bookingEnd(start, quote.durationMinutes), tz, business.locale)} ·{" "}
        {formatDuration(quote.durationMinutes)} · {timeZoneLabel(tz)}
      </p>
    </Section>
  );
}

function WhatSummary({
  business,
  service,
  selection,
}: {
  business: PublicBusiness;
  service: PublicService;
  selection: Selection;
}) {
  const { v } = useVocabulary();
  const { option, addons } = chosenExtras(service, selection);
  const resource = resourceChoiceName(selection, service, v("resource"));
  // "With Alex", but "Any therapist" as it is.
  const withWhom = resource && (selection.resource === ANY_RESOURCE ? resource : `With ${resource}`);
  const group = business.customerGroups.find((g) => g.id === selection.groupId);
  return (
    <>
      <p className="font-medium">
        {service.name}
        {option && <span className="text-muted-foreground"> · {option.name}</span>}
      </p>
      {addons.length > 0 && (
        <p className="text-sm text-muted-foreground">+ {addons.map((a) => a.name).join(", ")}</p>
      )}
      {(withWhom || group) && (
        <p className="text-sm text-muted-foreground">{[withWhom, group?.name].filter(Boolean).join(" · ")}</p>
      )}
    </>
  );
}

function DetailsSummary({ details, questions }: { details: DetailsValues; questions: Question[] }) {
  const answered = questions
    .filter((q) => isAnswered(q, details.answers[q.id]))
    .map((q) => ({ q, value: details.answers[q.id]?.trim() ?? "" }));
  const notes = details.notes.trim();
  return (
    <>
      <p className="font-medium">{details.name}</p>
      <p className="text-sm text-muted-foreground">
        {[details.email, details.phone].filter(Boolean).join(" · ")}
      </p>
      {(answered.length > 0 || notes) && (
        <dl className="mt-3 flex flex-col gap-2.5 border-t border-border-subtle pt-3 text-sm">
          {answered.map(({ q, value }) => (
            <div key={q.id} className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                {q.label}
                {q.sensitive && (
                  <Badge tone="neutral" className="h-4.5 px-1.5 text-2xs">
                    <Lock /> Private
                  </Badge>
                )}
              </dt>
              <dd className="break-words whitespace-pre-line">{q.kind === "checkbox" ? "Yes" : value}</dd>
            </div>
          ))}
          {notes && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Notes</dt>
              <dd className="break-words whitespace-pre-line">{notes}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}

/** Pay online now or at the venue, for a service that lets the customer choose. */
function HowToPay({ payment }: { payment: PaymentChoice }) {
  return (
    <RadioCards
      aria-label="How to pay"
      value={payment.atVenue ? "at_venue" : "online"}
      onValueChange={(v) => payment.setAtVenue(v === "at_venue")}
      columns={2}
      className="mb-4"
    >
      <RadioCard
        value="online"
        icon={<CreditCard />}
        title="Pay online now"
        description="Card, Apple Pay or Google Pay."
        className="p-3"
      />
      <RadioCard
        value="at_venue"
        icon={<Store />}
        title="Pay at the venue"
        description="Nothing to pay now."
        className="p-3"
      />
    </RadioCards>
  );
}

function PaymentSummary({
  business,
  service,
  quote,
}: {
  business: PublicBusiness;
  service: PublicService;
  quote: Quote;
}) {
  const { locale, currency: cur } = business;
  const howToPay = quote.mode === "deposit" ? null : paymentModeCopy(quote, cur, locale);
  return (
    <>
      <QuoteBreakdown quote={quote} currency={cur} locale={locale} variant="review" />
      <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3 text-sm text-muted-foreground">
        {howToPay && (
          <p className="flex gap-2">
            <CreditCard className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
            {howToPay}
          </p>
        )}
        <p className="flex gap-2">
          <Shield className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
          {cancellationSummary(business.policies, quote.mode, business.name)}
        </p>
        {service.requiresApproval && (
          <p className="flex gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
            {business.name} reviews each request. You&apos;ll get an email once it&apos;s confirmed.
          </p>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  onEdit,
  className,
  children,
}: {
  title: string;
  onEdit?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("py-4 sm:py-5", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-subtle-foreground">{title}</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Change ${title.toLowerCase()}`}
            className="-my-3.5 -mr-2 inline-flex h-11 items-center rounded-md px-2 text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Change
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
