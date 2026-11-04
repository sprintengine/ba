/**
 * The booking flow's WebMCP tools: an AI agent in the visitor's browser looks up services and times, makes the
 * choices and fills in the details in the page itself, so the customer sees each step happen and the review
 * screen before anything is booked. Loaded only in browsers with WebMCP (`use-booking-agent-tools.ts`).
 *
 * Every tool reads the flow as last rendered (`flow()`), so a step an agent moved to is the step the next call
 * sees. Choices go through the flow's URL state, exactly as clicks do.
 */
import type { QueryClient } from "@tanstack/react-query";
import {
  agentDetails,
  agentSelection,
  availabilityRange,
  isTimeOfDay,
  MAX_RANGE_DAYS,
  readInput,
} from "@/lib/booking/agent";
import {
  availableTimes,
  bookingOptions,
  detailsProblems,
  flowStatus,
  quoteSummary,
} from "@/lib/booking/agent-views";
import { buildDetailsSchema, type DetailsValues } from "@/lib/booking/details-schema";
import { payingAtVenue, quote as computeQuote, withSlotOffer } from "@/lib/booking/quote";
import { availabilityQuery } from "@/lib/booking/selection";
import { findService } from "@/lib/booking/services";
import { resolveStep } from "@/lib/booking/steps";
import { maxBookableDate } from "@/lib/booking/windows";
import { todayInTz, toPlainDate, toTimeOfDay, zonedToIso } from "@/lib/format";
import type { ModelContextTool } from "@/lib/webmcp/model-context";
import {
  availabilityOutput,
  bookingOptionsOutput,
  confirmOutput,
  detailsOutput,
  flowStatusOutput,
} from "./booking-agent-output";
import { freeSlot, monthDays, nextSlot } from "./booking-agent-availability";
import type { BookingFlowModel } from "./use-booking-flow";

type Deps = { flow: () => BookingFlowModel; queryClient: QueryClient };

const selectionProperties = {
  groupId: { type: "string", description: "Required when the business has customer groups." },
  serviceId: { type: "string" },
  optionId: {
    type: "string",
    description: "Required when the service has options (unless it has just one).",
  },
  addonIds: { type: "array", items: { type: "string" } },
  resourceId: {
    type: "string",
    description: 'Who or what, when the service offers a choice: an id, or "any" (the default).',
  },
} as const;

export function bookingAgentTools(deps: Deps): ModelContextTool[] {
  return [
    getBookingOptions(deps),
    checkAvailability(deps),
    selectAppointment(deps),
    fillBookingDetails(deps),
    getBookingStatus(deps),
    confirmBooking(deps),
  ];
}

function getBookingOptions({ flow }: Deps): ModelContextTool {
  return {
    name: "get_booking_options",
    title: "Services and how to book",
    description:
      "Lists what this business offers: its services with options, add-ons, prices, how they're paid for, " +
      "the choice of who or what (resourceChoice), and the questions asked when booking; and its customer groups " +
      "(when there are any, the customer must choose one). Start here.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: bookingOptionsOutput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const f = flow();
      return bookingOptions(f.business, f.services);
    },
  };
}

function checkAvailability({ flow, queryClient }: Deps): ModelContextTool {
  return {
    name: "check_availability",
    title: "Find free times",
    description:
      "Free times for a service (with its option, add-ons, group and resource) between two dates, as dates and " +
      `24-hour times in the business's timezone. Looks at up to ${MAX_RANGE_DAYS} days; \`from\` defaults to ` +
      "today and `to` to a week after `from`. A business that offers its next available time only returns one " +
      "time: the earliest from `from` (after `afterTime` on that day, to step to a later one).",
    inputSchema: {
      type: "object",
      properties: {
        ...selectionProperties,
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        afterTime: { type: "string", description: "HH:mm: only times after this on the `from` date." },
      },
      required: ["serviceId"],
    },
    outputSchema: availabilityOutput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, { signal }) => {
      const { business, services } = flow();
      const tz = business.timezone;
      const read = readInput(input);
      const now = nowIn(tz);
      const selected = agentSelection(
        business,
        services,
        { ...selectionInput(read), date: null, time: null },
        now,
      );
      const from = read.string("from");
      const to = read.string("to");
      const afterTime = read.string("afterTime");
      if (read.problems.length) return { error: read.problems.join("; ") };
      if (!selected.ok) return { error: selected.error };
      const sel = selected.value;
      const service = findService(services, sel.serviceId);
      if (!service) return { error: "Unknown service." };
      if (afterTime && !isTimeOfDay(afterTime)) return { error: "afterTime must be HH:mm (24-hour)." };
      const max = maxBookableDate(now.today, service, business.policies);
      const range = availabilityRange(from, to, { today: now.today, max });
      if (!range.ok) return { error: range.error };
      const { from: start, to: end } = range.value;
      const after = afterTime ? zonedToIso(start, afterTime, tz) : null;
      const query = availabilityQuery(sel, service);
      const price = quoteSummary(computeQuote(service, sel.optionId, sel.addonIds), business);

      if (business.policies.nextAvailableOnly) {
        const slot = await nextSlot(business.slug, query, { start, max, after }, signal);
        return {
          timezone: tz,
          price,
          nextAvailable: slot && {
            date: toPlainDate(slot.start, tz),
            time: toTimeOfDay(slot.start, tz),
            deal: slot.offer?.label ?? null,
          },
          note: slot
            ? "One time at a time: for a later one, call again with from set to its date and afterTime to its time."
            : `No free time from ${start} up to ${max}, the furthest ahead it can be booked.`,
        };
      }

      const days = await monthDays(queryClient, business.slug, query, {
        from: start,
        to: end,
        today: now.today,
        max,
      });
      const times = availableTimes(days, business, { from: start, to: end, after });
      return {
        timezone: tz,
        from: start,
        to: end,
        price,
        ...times,
        note: times.days.length
          ? null
          : `No free times from ${start} to ${end}. It can be booked up to ${max}: try later dates.`,
      };
    },
  };
}

function selectAppointment({ flow, queryClient }: Deps): ModelContextTool {
  return {
    name: "select_appointment",
    title: "Choose the appointment",
    description:
      "Makes the customer's choices on the booking page: the service with its option, add-ons, group and " +
      "resource, and the date and time (check it with check_availability first; both may be left out to stop at " +
      "the time step). The page moves on to the next thing it needs, usually the customer's details. " +
      "payAtVenue chooses paying at the venue for a service that offers it.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectionProperties,
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:mm (24-hour), in the business's timezone." },
        payAtVenue: { type: "boolean" },
      },
      required: ["serviceId"],
    },
    outputSchema: flowStatusOutput,
    execute: async (input, { signal }) => {
      const f = flow();
      const { business, services } = f;
      const read = readInput(input);
      const selected = agentSelection(business, services, selectionInput(read), nowIn(business.timezone));
      const payAtVenue = read.boolean("payAtVenue");
      if (read.problems.length) return { error: read.problems.join("; ") };
      if (!selected.ok) return { error: selected.error };
      const sel = selected.value;
      const service = findService(services, sel.serviceId);
      if (!service) return { error: "Unknown service." };

      let quote = computeQuote(service, sel.optionId, sel.addonIds);
      const payAtVenueOffered =
        service.allowPayAtVenue && (quote.mode === "full" || quote.mode === "deposit");
      if (payAtVenue && !payAtVenueOffered) return { error: `${service.name} can't be paid at the venue.` };

      if (sel.date && sel.time) {
        const slot = await freeSlot(queryClient, business, service, sel, signal);
        if (!slot)
          return {
            error: `${sel.date} at ${sel.time} isn't free for this. Call check_availability for free times.`,
          };
        quote = withSlotOffer(quote, service, slot.offer);
        if (business.policies.nextAvailableOnly) f.time.after.refind(sel.date, sel.time);
      }
      if (sel.date) f.time.setMonth(sel.date.slice(0, 7));
      if (payAtVenue !== null) f.payment.setAtVenue(payAtVenue);
      f.time.setConflict(null);
      // The furthest step; the flow shows the first one still to do.
      const requested = sel.time ? "review" : "time";
      f.navigate({ ...sel, step: requested }, "push");

      const atVenue = payAtVenue ?? f.payment.atVenue;
      return flowStatus({
        ...statusInput(f),
        service,
        sel,
        step: resolveStep(requested, sel, f.ctx),
        quote: atVenue && payAtVenueOffered ? payingAtVenue(quote) : quote,
        payment: { offered: payAtVenueOffered, atVenue: atVenue && payAtVenueOffered },
        alert: null,
        conflict: null,
      });
    },
  };
}

function fillBookingDetails({ flow }: Deps): ModelContextTool {
  return {
    name: "fill_booking_details",
    title: "Fill in the customer's details",
    description:
      "Fills in the customer's details on the booking page: name, email, phone and notes, and answers to the " +
      "service's questions by question id (true/false for a checkbox, one of the choices for a select; choose the " +
      "service first). Only send what the customer has told you; agree to nothing for them. Fields left out keep " +
      "what the page has. Returns what's still missing or wrong; when nothing is, the page moves to the review.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string", description: "Anything the customer wants the business to know." },
        answers: {
          type: "object",
          description: "By question id (from get_booking_options).",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
      },
    },
    outputSchema: detailsOutput,
    execute: (input) => {
      const f = flow();
      const { form, questions, requirePhone } = f.details;
      const merged = agentDetails(form.getValues(), input, questions);
      if (!merged.ok) return { error: merged.error };
      setFormValues(f, merged.value);

      const parsed = buildDetailsSchema({ requirePhone, questions }).safeParse(merged.value);
      f.details.setComplete(parsed.success);
      if (!parsed.success) {
        // Shows the problems on the form too, where the customer can fix them.
        if (f.step === "details") void form.trigger();
        return { complete: false, problems: detailsProblems(parsed.error.issues, questions) };
      }
      const timeChosen = !!f.sel.date && !!f.sel.time;
      if (timeChosen) f.navigate({ ...f.sel, step: "review" }, "push");
      return {
        complete: true,
        next: timeChosen
          ? "The page shows the review. Show the customer the summary and price; once they agree, call confirm_booking."
          : "Choose a time with check_availability and select_appointment.",
      };
    },
  };
}

function getBookingStatus({ flow }: Deps): ModelContextTool {
  return {
    name: "get_booking_status",
    title: "Where the booking is",
    description:
      "The booking page's state: the step it shows, what has been chosen, the price and what's paid when, the " +
      "details given and what's missing, any problem it shows, and what to do next.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: flowStatusOutput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => flowStatus(statusInput(flow())),
  };
}

function confirmBooking({ flow }: Deps): ModelContextTool {
  return {
    name: "confirm_booking",
    title: "Book it",
    description:
      "Books the appointment shown on the review step, as the customer pressing the button would. Only call it " +
      "once the customer has seen the summary and price and agreed. When the service is paid online, the page " +
      "takes the customer to the payment page and they pay there themselves; the time is held while they do.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: confirmOutput,
    annotations: { consequentialHint: true },
    execute: async () => {
      const f = flow();
      if (f.step !== "review")
        return {
          error: `The page is on the ${f.step} step, not the review. ${flowStatus(statusInput(f)).next}`,
        };
      if (f.submit.pending) return { error: "The booking is already being made." };
      const { business, service, quote } = f;
      const email = f.details.form.getValues().email.trim();
      const outcome = await f.submit.submit();
      switch (outcome.type) {
        case "booked":
          return service?.requiresApproval
            ? {
                booked: true,
                status: "requested",
                message: `Request sent: ${business.name} will confirm it, and ${email} will hear when they do.`,
              }
            : {
                booked: true,
                status: "confirmed",
                message: `Booked. A confirmation is on its way to ${email}; the page now shows the booking.`,
              };
        case "payment":
          return {
            booked: false,
            status: "awaiting_payment",
            message:
              `The page is taking the customer to the secure payment page to pay ` +
              `${quote ? quoteSummary(quote, business).payNow : "online"} themselves. The time is held for ` +
              `${business.policies.holdMinutes} minutes, and booked once they pay.`,
          };
        case "slot_taken":
          return {
            error:
              "Someone else just booked that time; the page is back at the time step. Find another with " +
              "check_availability and choose it with select_appointment.",
          };
        case "details":
          return {
            error: "Some details need fixing; the page is back at the details step.",
            problems: flowStatus(statusInput(flow())).details.problems,
          };
        case "failed":
          return { error: `${outcome.alert.title}. ${outcome.alert.body}` };
        case "not_ready":
          return { error: flowStatus(statusInput(f)).next };
      }
    },
  };
}

function selectionInput(read: ReturnType<typeof readInput>) {
  return {
    groupId: read.string("groupId"),
    serviceId: read.string("serviceId"),
    optionId: read.string("optionId"),
    addonIds: read.strings("addonIds"),
    resourceId: read.string("resourceId"),
    date: read.string("date"),
    time: read.string("time"),
  };
}

function nowIn(timeZone: string) {
  const now = new Date();
  return { today: todayInTz(timeZone, now), nowTime: toTimeOfDay(now, timeZone) };
}

/** Puts values in the details form as typing would (dirty and touched, so the form shows them as entered). */
function setFormValues(f: BookingFlowModel, values: DetailsValues) {
  const { form } = f.details;
  const options = { shouldDirty: true, shouldTouch: true } as const;
  form.setValue("name", values.name, options);
  form.setValue("email", values.email, options);
  form.setValue("phone", values.phone, options);
  form.setValue("notes", values.notes, options);
  for (const [id, answer] of Object.entries(values.answers))
    if (answer !== undefined) form.setValue(`answers.${id}`, answer, options);
}

function statusInput(f: BookingFlowModel) {
  const { questions, requirePhone, form } = f.details;
  const details = form.getValues();
  const parsed = buildDetailsSchema({ requirePhone, questions }).safeParse(details);
  return {
    business: f.business,
    service: f.service,
    sel: f.sel,
    step: f.step,
    quote: f.quote,
    details,
    detailsIssues: parsed.success ? [] : parsed.error.issues,
    questions,
    payment: f.payment,
    alert: f.submit.alert,
    conflict: f.time.conflict,
  };
}
