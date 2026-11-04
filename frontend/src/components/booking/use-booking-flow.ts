"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
import { isApiError, newIdempotencyKey } from "@/lib/api/client";
import { useCreatePublicBooking, usePublicAvailabilityWindows, usePublicNextSlot } from "@/lib/api/hooks";
import type { PublicBusiness, PublicService, Slot } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { contactLine } from "@/lib/booking/copy";
import {
  buildDetailsSchema,
  detailsResolver,
  EMPTY_DETAILS,
  sortedQuestions,
  type DetailsValues,
} from "@/lib/booking/details-schema";
import { clearSavedDetails, loadSavedDetails, saveDetails } from "@/lib/booking/details-storage";
import {
  bookingErrorAlert,
  classifyBookingError,
  mapBookingFieldErrors,
  type BookingAlert,
} from "@/lib/booking/errors";
import { payingAtVenue, quote as computeQuote, withSlotOffer, type Quote } from "@/lib/booking/quote";
import { bookingRequest } from "@/lib/booking/request";
import { applyChange, availabilityQuery, chosenSlot, type SelectionChange } from "@/lib/booking/selection";
import { findService, servicesForGroup } from "@/lib/booking/services";
import {
  canPickTime,
  getSteps,
  nextStep,
  resolveStep,
  stepTotal,
  type FlowContext,
  type StepId,
} from "@/lib/booking/steps";
import { parseFlowParams, serializeFlowParams, type FlowState } from "@/lib/booking/url";
import { afterToRefind, nextSlotWindows } from "@/lib/booking/next-slot";
import { maxBookableDate, pickerWindows, withBookableTime } from "@/lib/booking/windows";
import { todayInTz, toPlainDate, toTimeOfDay, type PlainDate } from "@/lib/format";
import { useVocabulary } from "@/lib/vocabulary";

type NavigationMode = "push" | "replace";

/**
 * Everything the public booking flow needs: the URL state (selection and step), the details form, the time
 * picker's availability, the price, and submitting. `BookingFlow` lays it out; `FlowStep` renders the step.
 */
export function useBookingFlow(business: PublicBusiness, services: PublicService[]) {
  const url = useFlowUrlState(business, services);
  const service = findService(services, url.flow.serviceId);
  const details = useDetailsForm(business, services, service);
  const nav = flowNavigation(business, services, url, details.complete);
  const time = useFlowAvailability(business, service, nav);
  const onlineQuote = service
    ? withSlotOffer(
        computeQuote(service, nav.sel.optionId, nav.sel.addonIds),
        service,
        time.chosenSlot?.offer,
      )
    : null;
  const payment = usePaymentChoice(service, onlineQuote);
  const quote = onlineQuote && payment.atVenue ? payingAtVenue(onlineQuote) : onlineQuote;
  const submit = useSubmitBooking({
    business,
    priced: service && quote ? { service, quote } : null,
    payment,
    nav,
    details,
    onSlotTaken: () => {
      time.setConflict(
        time.nextOnly
          ? "Someone just booked that time. Here's the next one available."
          : "Someone just booked that time. We've refreshed the times so you can pick another.",
      );
      url.navigate({ ...nav.sel, time: null, step: "time" }, "push");
    },
  });
  return { business, services, service, quote, payment, details, time, submit, ...nav };
}

/**
 * Online or at the venue, for a service that lets the customer choose (`allowPayAtVenue`) a price that would be paid
 * online. Online until they choose otherwise.
 */
function usePaymentChoice(service: PublicService | null, onlineQuote: Quote | null) {
  const [payAtVenue, setPayAtVenue] = useState(false);
  const offered =
    !!service?.allowPayAtVenue && (onlineQuote?.mode === "full" || onlineQuote?.mode === "deposit");
  return { offered, atVenue: offered && payAtVenue, setAtVenue: setPayAtVenue };
}

export type PaymentChoice = ReturnType<typeof usePaymentChoice>;

export type BookingFlowModel = ReturnType<typeof useBookingFlow>;

/**
 * The flow's state in the URL (`?service=…&step=…`), so refresh, back and share work. A date that can't be booked
 * any more (a link or a tab from another day) counts as none, so the time step starts over.
 */
function useFlowUrlState(business: PublicBusiness, services: PublicService[]) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tz = business.timezone;
  const today = useMemo(() => todayInTz(tz), [tz]);
  const [nowTime] = useState(() => toTimeOfDay(new Date().toISOString(), tz));
  const parsed = useMemo(() => parseFlowParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const max = maxBookableDate(today, findService(services, parsed.serviceId), business.policies);
  const flow = useMemo(
    () => withBookableTime(parsed, { today, max, nowTime }),
    [parsed, today, max, nowTime],
  );
  // History API rather than the router: no server round trip per step; useSearchParams follows it.
  const navigate = useCallback(
    (next: FlowState, mode: NavigationMode = "push") => {
      const qs = serializeFlowParams(next);
      const target = qs ? `${pathname}?${qs}` : pathname;
      window.history[mode === "push" ? "pushState" : "replaceState"](null, "", target);
    },
    [pathname],
  );
  return { flow, pathname, navigate };
}

/** The steps for the current selection, the step to show, and moving between them. */
function flowNavigation(
  business: PublicBusiness,
  services: PublicService[],
  url: ReturnType<typeof useFlowUrlState>,
  detailsComplete: boolean,
) {
  const sel = url.flow;
  const service = findService(services, sel.serviceId);
  const steps = getSteps(business, service);
  const total = stepTotal(
    business,
    sel.groupId ? servicesForGroup(services, sel.groupId) : services,
    service,
  );
  const ctx: FlowContext = { business, services, detailsComplete };
  const step = resolveStep(url.flow.step, sel, ctx);
  const goTo = (target: StepId) => url.navigate({ ...sel, step: target }, "push");
  /** Apply a selection and (optionally) advance to the next step of the resulting flow. */
  const choose = (change: SelectionChange, advance: boolean) => {
    const nextSel = applyChange(sel, change, services);
    const nextSteps = getSteps(business, findService(services, nextSel.serviceId));
    url.navigate(
      { ...nextSel, step: advance ? nextStep(step, nextSteps) : step },
      advance ? "push" : "replace",
    );
  };
  return {
    sel,
    steps,
    step,
    stepIndex: steps.indexOf(step),
    /** The progress's total steps, and whether "of N" can be said yet (see `stepTotal`). */
    stepTotal: total,
    ctx,
    pathname: url.pathname,
    navigate: url.navigate,
    goTo,
    choose,
  };
}

type FlowNavigation = ReturnType<typeof flowNavigation>;

/**
 * The details form: its schema follows the service's questions; values are restored from this session,
 * prefilled from the account, and saved as they change. `complete` is whether they are valid (they are not in
 * the URL, so the review step depends on it).
 */
function useDetailsForm(business: PublicBusiness, services: PublicService[], service: PublicService | null) {
  const auth = useAuth();
  const requirePhone = business.policies.requireCustomerPhone;
  const questions = sortedQuestions(service);
  const schema = buildDetailsSchema({ requirePhone, questions });
  const [complete, setComplete] = useState(false);
  // useForm picks up a new resolver on every render, so the schema follows the service.
  const form = useForm<DetailsValues>({
    resolver: detailsResolver(schema),
    defaultValues: EMPTY_DETAILS,
    mode: "onTouched",
  });

  // Restore details saved this session (never sensitive answers), then prefill from the account.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadSavedDetails(business.slug);
    if (!saved) return;
    form.reset(saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage once on mount
    setComplete(schema.safeParse(saved).success);
  }, [business.slug, form, schema]);
  useEffect(() => {
    if (!auth.isSignedIn || !auth.user) return;
    const values = form.getValues();
    if (!values.name && auth.user.name) form.setValue("name", auth.user.name);
    if (!values.email) form.setValue("email", auth.user.email);
  }, [auth.isSignedIn, auth.user, form]);
  // Answers stay in the form when the customer switches service, so every service's sensitive questions are
  // left out of storage, not just the current one's.
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

  // Details validity depends on the service's questions.
  const schemaKey = `${service?.id ?? ""}|${requirePhone}`;
  const [checkedKey, setCheckedKey] = useState(schemaKey);
  if (checkedKey !== schemaKey) {
    setCheckedKey(schemaKey);
    setComplete(schema.safeParse(form.getValues()).success);
  }

  /** Validates the whole form (showing errors); false sends the customer back to it. */
  const validate = async () => {
    const valid = await form.trigger();
    if (!valid) setComplete(false);
    return valid;
  };
  /** Shows a booking error's details-form field errors; true when there were any. */
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

type DetailsForm = ReturnType<typeof useDetailsForm>;

/**
 * The time step: the bookable range, the month shown, its availability, and the "time was taken" notice. A
 * business that offers its next available time only gets `next` (one time, stepped through with `after`) instead
 * of month windows.
 */
function useFlowAvailability(business: PublicBusiness, service: PublicService | null, nav: FlowNavigation) {
  const tz = business.timezone;
  const nextOnly = business.policies.nextAvailableOnly;
  const today = useMemo(() => todayInTz(tz), [tz]);
  const maxDate = maxBookableDate(today, service, business.policies);
  const [month, setMonth] = useState(() =>
    (nav.sel.date && nav.sel.date >= today ? nav.sel.date : today).slice(0, 7),
  );
  /** The phone week strip's week when moved away from the date's (null: the date's week). */
  const [shownWeek, setShownWeek] = useState<PlainDate | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const canPick = canPickTime(nav.sel, nav.ctx);
  const query = availabilityQuery(nav.sel, service);
  const windows = canPick && !nextOnly ? pickerWindows(month, nav.sel.date, today, maxDate, shownWeek) : [];
  // Query keys hash by value, so a fresh object per render is fine.
  const availability = usePublicAvailabilityWindows(business.slug, query, windows);
  const after = useNextSlotCursor(nav.sel, query, tz);
  const next = usePublicNextSlot(
    business.slug,
    query,
    nextSlotWindows(today, maxDate, after.value, tz),
    after.value,
    canPick && nextOnly,
  );

  const { navigate } = nav;
  const onDateChange = useCallback(
    (date: PlainDate, reason: "user" | "auto") => {
      setConflict((c) => (reason === "user" ? null : c));
      setShownWeek(null);
      const current = parseFlowParams(new URLSearchParams(window.location.search));
      navigate({ ...current, date, time: null }, "replace");
      if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7));
    },
    [navigate, month, setConflict, setMonth, setShownWeek],
  );
  const onSelectSlot = (_slot: Slot, date: PlainDate, time: string) => {
    setConflict(null);
    nav.choose({ type: "time", date, time }, true);
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
    onSelectSlot,
  };
}

/**
 * Where the next-available search starts: null for the earliest time, a shown time's start after "Show a later
 * time". Starts just before an already chosen time (a refresh or link mid-flow), so that time is found again;
 * a different service, option, add-ons, group or resource starts over: from the earliest, as choosing any of
 * them clears the time, or from the chosen time when one came with it (an agent's choice).
 */
function useNextSlotCursor(sel: FlowState, query: ReturnType<typeof availabilityQuery>, timeZone: string) {
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
    /** Show the next time after this one. */
    later: (slot: Slot) => setValue(slot.start),
    earliest: () => setValue(null),
    /** Show this time (an agent's choice, while it is still free). */
    refind: (date: PlainDate, time: string) => setValue(afterToRefind(date, time, timeZone)),
  };
}

/** How a submit ended, for an agent that pressed the button (the page shows it either way). */
export type SubmitOutcome =
  | { type: "booked" }
  | { type: "payment" }
  | { type: "slot_taken" }
  | { type: "details" }
  | { type: "failed"; alert: BookingAlert }
  | { type: "not_ready" };

/**
 * Submits the booking with one idempotency key per submit intent (reused on retry, renewed when anything in
 * the request changes), then goes to the manage page or the payment provider. Errors: a taken time calls
 * `onSlotTaken`, field errors go back to the details form, anything else becomes the review step's alert.
 */
function useSubmitBooking({
  business,
  priced,
  payment,
  nav,
  details,
  onSlotTaken,
}: {
  business: PublicBusiness;
  priced: { service: PublicService; quote: Quote } | null;
  payment: PaymentChoice;
  nav: FlowNavigation;
  details: DetailsForm;
  onSlotTaken: () => void;
}) {
  const router = useRouter();
  const { v } = useVocabulary();
  const create = useCreatePublicBooking(business.slug);
  const intent = useRef<{ key: string; fingerprint: string } | null>(null);
  const [alert, setAlert] = useState<BookingAlert | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  /** The manage page this page's URL was replaced with before leaving for the payment page. */
  const leftFor = useRef<string | null>(null);

  // Back from the payment page can restore this page as it was left (the back/forward cache): the overlay is
  // still up and the URL is already the booking's manage page, so go there.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !leftFor.current) return;
      setRedirecting(false);
      router.replace(leftFor.current);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  const fail = (err: unknown): SubmitOutcome => {
    if (classifyBookingError(err) === "slot_taken") {
      intent.current = null;
      onSlotTaken();
      return { type: "slot_taken" };
    }
    if (details.showFieldErrors(err)) {
      nav.goTo("details");
      return { type: "details" };
    }
    const failure = bookingErrorAlert(err, {
      businessName: business.name,
      contact: contactLine(business),
      bookingsNoun: v("bookings"),
      payAtVenueOffered: payment.offered && !payment.atVenue,
    });
    setAlert(failure);
    return { type: "failed", alert: failure };
  };

  const submit = async (): Promise<SubmitOutcome> => {
    if (!priced || !nav.sel.date || !nav.sel.time) return { type: "not_ready" };
    setAlert(null);
    if (!(await details.validate())) {
      nav.goTo("details");
      return { type: "details" };
    }
    const body = bookingRequest({
      service: priced.service,
      selection: nav.sel,
      details: details.form.getValues(),
      questions: details.questions,
      timeZone: business.timezone,
      returnUrl: window.location.origin,
      payAtVenue: payment.atVenue,
      // What the review step shows (with the time's deal): a deal that ran out meanwhile is refused, not charged.
      expectedTotalCents: priced.quote.totalCents,
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
      clearSavedDetails(business.slug);
      const manageUrl = `/manage/${encodeURIComponent(result.manageToken)}`;
      if (result.next.type === "payment_required" && result.next.checkoutUrl) {
        // Back from the payment page lands on the booking's manage page (its time held, with Pay now), not on
        // this review step, where submitting again would find the time taken by its own hold.
        leftFor.current = `${manageUrl}?payment=cancelled`;
        window.history.replaceState(null, "", leftFor.current);
        setRedirecting(true);
        window.location.assign(result.next.checkoutUrl);
        return { type: "payment" };
      }
      // Replace, so Back from the manage page doesn't return to a review step that is already booked.
      router.replace(`${manageUrl}?booked=1`);
      return { type: "booked" };
    } catch (err) {
      return fail(err);
    }
  };

  return { submit, pending: create.isPending || redirecting, redirecting, alert };
}
