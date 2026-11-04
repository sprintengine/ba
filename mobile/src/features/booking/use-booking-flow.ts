/**
 * Everything the booking flow needs (the website's `useBookingFlow`, on the same shared rules): the selection and the
 * step, the details form, the time picker's availability, the price, paying at the venue, and submitting with an
 * idempotency key. The screen lays it out; the steps render from it.
 */
import { useEffect, useRef, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { isApiError, newIdempotencyKey } from "@shared/api/client";
import { useCreatePublicBooking, usePublicAvailabilityWindows } from "@shared/api/hooks/use-public";
import { usePublicNextSlot } from "@shared/api/hooks/use-next-slot";
import type { PublicBusiness, PublicService, Slot } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import { contactLine } from "@shared/booking/copy";
import {
  buildDetailsSchema,
  detailsResolver,
  EMPTY_DETAILS,
  sortedQuestions,
  type DetailsValues,
} from "@shared/booking/details-schema";
import {
  bookingErrorAlert,
  classifyBookingError,
  mapBookingFieldErrors,
  type BookingAlert,
} from "@shared/booking/errors";
import { afterToRefind, nextSlotWindows } from "@shared/booking/next-slot";
import { payingAtVenue, quote as computeQuote, withSlotOffer, type Quote } from "@shared/booking/quote";
import { bookingRequest } from "@shared/booking/request";
import { applyChange, availabilityQuery, chosenSlot, type SelectionChange } from "@shared/booking/selection";
import { findService, servicesForGroup } from "@shared/booking/services";
import {
  canPickTime,
  getSteps,
  nextStep,
  previousStep,
  resolveStep,
  stepTotal,
  type FlowContext,
  type StepId,
} from "@shared/booking/steps";
import type { FlowState } from "@shared/booking/url";
import { maxBookableDate, pickerWindows, withBookableTime } from "@shared/booking/windows";
import { todayInTz, toPlainDate, toTimeOfDay, type PlainDate } from "@shared/format";
import { vocab } from "@shared/vocabulary";
import { env } from "~/config/env";
import { openCheckout, type CheckoutOutcome } from "./checkout";
import { clearDetails, loadDetails, saveDetails } from "./details-memory";

/** After booking: the booking's manage token and how the person got there (the manage view's context). */
export type FlowDone = {
  token: string;
  /** `checkout`: Checkout is open; then its outcome. */
  context: "booked" | "checkout" | CheckoutOutcome;
  checkoutUrl: string | null;
};

export function useBookingFlow(business: PublicBusiness, services: PublicService[], initial: FlowState) {
  const nav = useFlowNavigation(business, services, initial);
  const service = findService(services, nav.sel.serviceId);
  const details = useDetailsForm(business, services, service);
  const ctx: FlowContext = { business, services, detailsComplete: details.complete };
  const step = resolveStep(nav.requested, nav.sel, ctx);
  const time = useFlowAvailability(business, service, nav, ctx);
  const onlineQuote = service
    ? withSlotOffer(
        computeQuote(service, nav.sel.optionId, nav.sel.addonIds),
        service,
        time.chosenSlot?.offer,
      )
    : null;
  const payment = usePaymentChoice(service, onlineQuote);
  const quote = onlineQuote && payment.atVenue ? payingAtVenue(onlineQuote) : onlineQuote;
  const steps = getSteps(business, service);
  const goTo = (target: StepId) => nav.setRequested(target);
  const submit = useSubmitBooking({
    business,
    service,
    quote,
    payment,
    sel: nav.sel,
    details,
    goTo,
    onSlotTaken: () => {
      time.setConflict(
        time.nextOnly
          ? "Someone just booked that time. Here's the next one available."
          : "Someone just booked that time. We've refreshed the times so you can pick another.",
      );
      nav.update({ type: "clearTime" }, "time");
    },
  });
  const back = previousStep(step, steps);
  return {
    business,
    services,
    service,
    quote,
    payment,
    details,
    time,
    submit,
    sel: nav.sel,
    ctx,
    steps,
    step,
    stepIndex: steps.indexOf(step),
    stepTotal: stepTotal(
      business,
      nav.sel.groupId ? servicesForGroup(services, nav.sel.groupId) : services,
      service,
    ),
    goTo,
    /** The step before this one, if any (the step header's Back). */
    back,
    /** Apply a choice and (optionally) go on to the next step of the resulting flow. */
    choose: (change: SelectionChange, advance: boolean) => {
      const next = applyChange(nav.sel, change, services);
      const nextSteps = getSteps(business, findService(services, next.serviceId));
      nav.set(next, advance ? nextStep(step, nextSteps) : step);
    },
    /** The business's words ("appointment", "therapist"). */
    noun: (key: "booking" | "bookings" | "resource") => vocab(business.vocabulary, key),
  };
}

export type BookingFlowModel = ReturnType<typeof useBookingFlow>;

/** The selection and the step asked for (the website keeps them in the URL; here they live in the screen). */
function useFlowNavigation(business: PublicBusiness, services: PublicService[], initial: FlowState) {
  const tz = business.timezone;
  const [state, setState] = useState<FlowState>(() => {
    const today = todayInTz(tz);
    const nowTime = toTimeOfDay(new Date().toISOString(), tz);
    const max = maxBookableDate(today, findService(services, initial.serviceId), business.policies);
    return withBookableTime(initial, { today, max, nowTime });
  });
  const { step: requested, ...sel } = state;
  return {
    sel,
    requested,
    set: (next: Omit<FlowState, "step">, step: StepId | null) => setState({ ...next, step }),
    setRequested: (step: StepId) => setState((s) => ({ ...s, step })),
    update: (change: SelectionChange, step?: StepId) =>
      setState((s) => ({ ...applyChange(s, change, services), step: step ?? s.step })),
    setDate: (date: PlainDate) => setState((s) => ({ ...s, date, time: null })),
  };
}

type FlowNavigation = ReturnType<typeof useFlowNavigation>;

/** Online or at the venue, for a service that lets the customer choose; online until they choose otherwise. */
function usePaymentChoice(service: PublicService | null, onlineQuote: Quote | null) {
  const [payAtVenue, setPayAtVenue] = useState(false);
  const offered =
    !!service?.allowPayAtVenue && (onlineQuote?.mode === "full" || onlineQuote?.mode === "deposit");
  return { offered, atVenue: offered && payAtVenue, setAtVenue: setPayAtVenue };
}

export type PaymentChoice = ReturnType<typeof usePaymentChoice>;

/**
 * The details form: its schema follows the service's questions; prefilled from the account and from earlier in this
 * session (never sensitive answers). `complete` says whether they are valid (the review step depends on it).
 */
function useDetailsForm(business: PublicBusiness, services: PublicService[], service: PublicService | null) {
  const auth = useAuth();
  const requirePhone = business.policies.requireCustomerPhone;
  const questions = sortedQuestions(service);
  const schema = buildDetailsSchema({ requirePhone, questions });
  const [defaults] = useState<DetailsValues>(() => {
    const saved = loadDetails(business.slug) ?? EMPTY_DETAILS;
    return {
      ...saved,
      name: saved.name || (auth.isSignedIn ? (auth.user?.name ?? "") : ""),
      email: saved.email || (auth.isSignedIn ? (auth.user?.email ?? "") : ""),
    };
  });
  const [complete, setComplete] = useState(() => schema.safeParse(defaults).success);
  const form = useForm<DetailsValues>({
    resolver: detailsResolver(schema),
    defaultValues: defaults,
    mode: "onTouched",
  });

  // Answers stay when the customer switches service, so every service's sensitive answers are left out of memory.
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) =>
          saveDetails(
            business.slug,
            values,
            services.flatMap((s) => s.questions),
          ),
      }),
    [form, business.slug, services],
  );

  // Validity depends on the service's questions.
  const schemaKey = `${service?.id ?? ""}|${requirePhone}`;
  const [checkedKey, setCheckedKey] = useState(schemaKey);
  if (checkedKey !== schemaKey) {
    setCheckedKey(schemaKey);
    setComplete(schema.safeParse(form.getValues()).success);
  }

  /** Validates the whole form (showing errors); false sends the customer back to it. */
  const validate = async () => {
    const valid = await form.trigger();
    setComplete(valid);
    return valid;
  };
  /** Shows a booking error's field errors on the form; true when there were any. */
  const showFieldErrors = (err: unknown): boolean => {
    if (classifyBookingError(err) !== "fields" || !isApiError(err)) return false;
    const fields = Object.entries(mapBookingFieldErrors(err.fields).form);
    for (const [name, message] of fields) form.setError(name as Path<DetailsValues>, { message });
    if (fields.length === 0) return false;
    setComplete(false);
    return true;
  };
  const signedInAs = auth.isSignedIn && auth.user ? { name: auth.user.name, email: auth.user.email } : null;
  return { form, questions, requirePhone, complete, setComplete, validate, showFieldErrors, signedInAs };
}

export type DetailsForm = ReturnType<typeof useDetailsForm>;

/**
 * The time step: the bookable range, the month shown, its availability, and the "time was taken" notice. A business
 * that offers its next available time only gets `next` (one time, stepped through with `after`) instead.
 */
function useFlowAvailability(
  business: PublicBusiness,
  service: PublicService | null,
  nav: FlowNavigation,
  ctx: FlowContext,
) {
  const tz = business.timezone;
  const nextOnly = business.policies.nextAvailableOnly;
  const [today] = useState(() => todayInTz(tz));
  const maxDate = maxBookableDate(today, service, business.policies);
  const [month, setMonth] = useState(() =>
    (nav.sel.date && nav.sel.date >= today ? nav.sel.date : today).slice(0, 7),
  );
  const [shownWeek, setShownWeek] = useState<PlainDate | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const canPick = canPickTime(nav.sel, ctx);
  const query = availabilityQuery(nav.sel, service);
  const windows = canPick && !nextOnly ? pickerWindows(month, nav.sel.date, today, maxDate, shownWeek) : [];
  const availability = usePublicAvailabilityWindows(business.slug, query, windows);
  const after = useNextSlotCursor(nav.sel, query, tz);
  const next = usePublicNextSlot(
    business.slug,
    query,
    nextSlotWindows(today, maxDate, after.value, tz),
    after.value,
    canPick && nextOnly,
  );

  const onDateChange = (date: PlainDate, reason: "user" | "auto") => {
    setConflict((c) => (reason === "user" ? null : c));
    setShownWeek(null);
    nav.setDate(date);
    setMonth((m) => (date.slice(0, 7) !== m ? date.slice(0, 7) : m));
  };
  const nextDays = new Map(next.slot ? [[toPlainDate(next.slot.start, tz), [next.slot]]] : []);
  return {
    today,
    maxDate,
    month,
    setMonth,
    availability,
    nextOnly,
    next,
    after,
    chosenSlot: chosenSlot(nav.sel, nextOnly ? nextDays : availability.days, tz),
    conflict,
    setConflict,
    onDateChange,
    onWeekChange: setShownWeek,
  };
}

/**
 * Where the next-available search starts: null for the earliest time, a shown time's start after "Show a later time".
 * Starts just before an already chosen time, so that time is found again; another service, option, add-ons, group or
 * resource starts over.
 */
function useNextSlotCursor(sel: FlowState | Omit<FlowState, "step">, query: object, timeZone: string) {
  const chosen = sel.date && sel.time ? afterToRefind(sel.date, sel.time, timeZone) : null;
  const [value, setValue] = useState<string | null>(chosen);
  const queryKey = JSON.stringify(query);
  const [forQuery, setForQuery] = useState(queryKey);
  if (forQuery !== queryKey) {
    setForQuery(queryKey);
    setValue(chosen);
  }
  return {
    value,
    later: (slot: Slot) => setValue(slot.start),
    earliest: () => setValue(null),
  };
}

/** How a submit ended. */
export type SubmitOutcome =
  | { type: "booked" }
  | { type: "payment" }
  | { type: "slot_taken" }
  | { type: "details" }
  | { type: "failed"; alert: BookingAlert }
  | { type: "not_ready" };

/**
 * Submits with one idempotency key per submit intent (reused on retry, renewed when anything in the request changes),
 * then shows the booking, or opens Checkout for a paid one. A taken time goes back to the times, field errors to the
 * details form, anything else becomes the review step's alert.
 */
function useSubmitBooking({
  business,
  service,
  quote,
  payment,
  sel,
  details,
  goTo,
  onSlotTaken,
}: {
  business: PublicBusiness;
  service: PublicService | null;
  quote: Quote | null;
  payment: PaymentChoice;
  sel: FlowNavigation["sel"];
  details: DetailsForm;
  goTo: (step: StepId) => void;
  onSlotTaken: () => void;
}) {
  const create = useCreatePublicBooking(business.slug);
  const intent = useRef<{ key: string; fingerprint: string } | null>(null);
  const [alert, setAlert] = useState<BookingAlert | null>(null);
  const [done, setDone] = useState<FlowDone | null>(null);

  const fail = (err: unknown): SubmitOutcome => {
    if (classifyBookingError(err) === "slot_taken") {
      intent.current = null;
      onSlotTaken();
      return { type: "slot_taken" };
    }
    if (details.showFieldErrors(err)) {
      goTo("details");
      return { type: "details" };
    }
    const failure = bookingErrorAlert(err, {
      businessName: business.name,
      contact: contactLine(business),
      bookingsNoun: vocab(business.vocabulary, "bookings"),
      payAtVenueOffered: payment.offered && !payment.atVenue,
    });
    setAlert(failure);
    return { type: "failed", alert: failure };
  };

  /** Opens Checkout for the held booking and records how it ended. */
  const pay = async (token: string, checkoutUrl: string) => {
    setDone({ token, context: "checkout", checkoutUrl });
    let outcome: CheckoutOutcome = "unknown";
    try {
      outcome = await openCheckout(checkoutUrl, token);
    } catch {
      // The browser couldn't open: the booking view offers Pay again.
    }
    setDone({ token, context: outcome, checkoutUrl });
  };

  const submit = async (): Promise<SubmitOutcome> => {
    if (!service || !quote || !sel.date || !sel.time) return { type: "not_ready" };
    setAlert(null);
    if (!(await details.validate())) {
      goTo("details");
      return { type: "details" };
    }
    const body = bookingRequest({
      service,
      selection: sel,
      details: details.form.getValues(),
      questions: details.questions,
      timeZone: business.timezone,
      // The website's origin: Stripe returns to the booking's manage page there (and from there to the app).
      returnUrl: env.webUrl,
      payAtVenue: payment.atVenue,
      // What the review step shows: a deal that ran out meanwhile is refused, not charged.
      expectedTotalCents: quote.totalCents,
    });
    if (!body) return { type: "not_ready" };
    const fingerprint = JSON.stringify(body);
    const current =
      intent.current?.fingerprint === fingerprint
        ? intent.current
        : { key: newIdempotencyKey(), fingerprint };
    intent.current = current;
    try {
      const result = await create.mutateAsync({ body, idempotencyKey: current.key });
      intent.current = null;
      clearDetails(business.slug);
      if (result.next.type === "payment_required" && result.next.checkoutUrl) {
        void pay(result.manageToken, result.next.checkoutUrl);
        return { type: "payment" };
      }
      setDone({ token: result.manageToken, context: "booked", checkoutUrl: null });
      return { type: "booked" };
    } catch (err) {
      return fail(err);
    }
  };

  return { submit, pending: create.isPending, alert, done };
}
