/**
 * The booking flow as an AI agent in the browser is told it (WebMCP tools, `components/booking/booking-agent-tools.ts`):
 * what can be booked, free times, the price, and the flow's state, in words. Pure.
 *
 * Sensitive answers go in but never come back out: an agent may pass on what the customer told it, but the page
 * doesn't repeat it.
 */
import type { AvailabilityDay, PublicBusiness, PublicService } from "@/lib/api/types";
import { formatDuration, formatMoney, toPlainDate, toTimeOfDay, type PlainDate } from "@/lib/format";
import { shortAddress } from "./booking";
import {
  isAnswered,
  sortedQuestions,
  type DetailsIssue,
  type DetailsValues,
  type Question,
} from "./details-schema";
import type { BookingAlert } from "./errors";
import type { Quote } from "./quote";
import { ANY_RESOURCE, chosenExtras, resourceChoiceName, type Selection } from "./selection";
import type { StepId } from "./steps";

/** "€45", "Free". */
function moneyIn(business: Pick<PublicBusiness, "currency" | "locale">) {
  return (cents: number) =>
    cents === 0 ? "Free" : formatMoney(cents, business.currency, { locale: business.locale });
}

/** How a service is paid for, in words. */
function paymentTerms(s: PublicService, money: (cents: number) => string): string {
  const terms =
    s.paymentMode === "free"
      ? "Free"
      : s.paymentMode === "at_venue"
        ? "Paid at the venue"
        : s.paymentMode === "deposit" && s.depositCents != null
          ? `A ${money(s.depositCents)} deposit is paid online when booking, the rest at the venue`
          : "Paid in full online when booking";
  return s.allowPayAtVenue ? `${terms}; the customer may choose to pay at the venue instead` : terms;
}

/** Everything that can be booked, for `get_booking_options`. */
export function bookingOptions(business: PublicBusiness, services: PublicService[]) {
  const money = moneyIn(business);
  const groupName = (id: string) => business.customerGroups.find((g) => g.id === id)?.name ?? id;
  const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return {
    business: {
      name: business.name,
      description: business.description,
      address: shortAddress(business.address) || null,
      timezone: business.timezone,
      phoneRequired: business.policies.requireCustomerPhone,
      nextAvailableOnly: business.policies.nextAvailableOnly,
    },
    customerGroups: business.customerGroups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
    })),
    services: sorted.map((s) => {
      const req = s.selectableRequirement;
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        duration: formatDuration(s.durationMinutes),
        price: money(s.priceCents),
        payment: paymentTerms(s, money),
        requiresApproval: s.requiresApproval,
        onlyForGroups: s.allowedGroupIds.map(groupName),
        options: s.options.map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          duration: formatDuration(o.durationMinutes),
          price: money(o.priceCents),
        })),
        addons: s.addons.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          extraTime: formatDuration(a.extraMinutes),
          price: money(a.priceCents),
        })),
        resourceChoice:
          req && req.resources.length > 1
            ? {
                label: req.label,
                choices: [
                  { id: ANY_RESOURCE, name: `Any ${req.label.toLowerCase()}` },
                  ...req.resources.map((r) => ({ id: r.id, name: r.name, description: r.description })),
                ],
              }
            : null,
        questions: sortedQuestions(s).map((q) => ({
          id: q.id,
          label: q.label,
          help: q.helpText,
          kind: q.kind,
          choices: q.kind === "select" ? q.options : undefined,
          required: q.required,
          sensitive: q.sensitive,
        })),
      };
    }),
  };
}

/** A quote in words: length, total (and the deal), what is paid now and at the venue. */
export function quoteSummary(q: Quote, business: Pick<PublicBusiness, "currency" | "locale">) {
  const money = moneyIn(business);
  return {
    duration: formatDuration(q.durationMinutes),
    total: money(q.totalCents),
    deal: q.deal ? `${q.deal.label} (saves ${money(q.deal.discountCents)})` : null,
    payNow: q.dueNowCents ? money(q.dueNowCents) : null,
    payAtVenue: q.dueLaterCents ? money(q.dueLaterCents) : null,
  };
}

/**
 * Free times from availability days, in the business's zone: those after `after` (ISO instant) when given. Days
 * with no times are left out; a day a release schedule keeps closed says when it opens (null: when the business
 * opens it).
 */
export function availableTimes(
  days: AvailabilityDay[],
  business: Pick<PublicBusiness, "timezone" | "currency" | "locale">,
  { from, to, after = null }: { from: PlainDate; to: PlainDate; after?: string | null },
) {
  const tz = business.timezone;
  const money = moneyIn(business);
  const inRange = days
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = inRange
    .map((d) => {
      const slots = d.slots.filter((s) => !after || new Date(s.start).getTime() > new Date(after).getTime());
      const deals = slots
        .filter((s) => s.offer)
        .map((s) => ({
          time: toTimeOfDay(s.start, tz),
          deal: s.offer?.label,
          price: money(s.offer?.priceCents ?? 0),
        }));
      return {
        date: d.date,
        times: slots.map((s) => toTimeOfDay(s.start, tz)),
        ...(deals.length ? { deals } : {}),
      };
    })
    .filter((d) => d.times.length > 0);
  const notYetOpen = inRange
    .filter((d) => d.opensAt || d.held)
    .map((d) => ({
      date: d.date,
      opensForBooking: d.opensAt ? `${toPlainDate(d.opensAt, tz)} ${toTimeOfDay(d.opensAt, tz)}` : null,
    }));
  return { days: open, notYetOpen };
}

/** A details issue's field in words: "Full name", a question's label. */
function fieldLabel(path: string[], questions: Question[]): string {
  const [field, id] = path;
  if (field === "answers") return questions.find((q) => q.id === id)?.label ?? "An answer";
  return { name: "Full name", email: "Email", phone: "Phone", notes: "Notes" }[field ?? ""] ?? field ?? "";
}

/** The details form's problems in words ("Email: Enter a valid email address"). */
export function detailsProblems(issues: DetailsIssue[], questions: Question[]): string[] {
  return issues.map((i) => `${fieldLabel(i.path, questions)}: ${i.message}`);
}

/** What the agent should do on each step. */
const NEXT: Record<StepId, string> = {
  group: "Choose a customer group, service and time with select_appointment.",
  service: "Choose a service and time with select_appointment.",
  extras: "Choose the service's option and add-ons with select_appointment.",
  resource: "Choose who or what with select_appointment.",
  time: "Find a time with check_availability, then choose it with select_appointment.",
  details: "Give the customer's details with fill_booking_details.",
  review:
    "Show the customer the summary and price. Once they agree, call confirm_booking (or they can press the button).",
};

export type FlowStatusInput = {
  business: PublicBusiness;
  service: PublicService | null;
  sel: Selection;
  step: StepId;
  quote: Quote | null;
  details: DetailsValues;
  detailsIssues: DetailsIssue[];
  questions: Question[];
  payment: { offered: boolean; atVenue: boolean };
  alert: BookingAlert | null;
  conflict: string | null;
};

/** The flow's state in words, for `get_booking_status` and after each action. Sensitive answers are not repeated. */
export function flowStatus(s: FlowStatusInput) {
  const { business, service, sel } = s;
  const { option, addons } = chosenExtras(service, sel);
  const group = business.customerGroups.find((g) => g.id === sel.groupId);
  const answers = s.questions
    .filter((q) => isAnswered(q, s.details.answers[q.id]))
    .map((q) => ({
      question: q.label,
      answer: q.sensitive ? "(given; sensitive, not repeated)" : (s.details.answers[q.id] ?? "").trim(),
    }));
  return {
    step: s.step,
    next: NEXT[s.step],
    notice: s.alert ? `${s.alert.title}. ${s.alert.body}` : s.conflict,
    selection: {
      group: group?.name ?? null,
      service: service?.name ?? null,
      option: option?.name ?? null,
      addons: addons.map((a) => a.name),
      resource: resourceChoiceName(sel, service, "resource") ?? null,
      date: sel.date,
      time: sel.time,
      timezone: business.timezone,
    },
    price: s.quote ? quoteSummary(s.quote, business) : null,
    payment: s.payment.offered
      ? s.payment.atVenue
        ? "at the venue"
        : "online (at the venue is offered too)"
      : null,
    details: {
      name: s.details.name.trim() || null,
      email: s.details.email.trim() || null,
      phone: s.details.phone.trim() || null,
      answers,
      problems: detailsProblems(s.detailsIssues, s.questions),
    },
  };
}
