/**
 * An AI agent's input to the booking flow (WebMCP tools, `components/booking/booking-agent-tools.ts`), checked by
 * the same rules as the steps, with errors that say what to send instead. What the flow tells the agent is in
 * `agent-views.ts`. Pure.
 */
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { addDaysToPlainDate, isPlainDate, type PlainDate } from "@/lib/format";
import type { DetailsValues, Question } from "./details-schema";
import { ANY_RESOURCE, type Selection } from "./selection";
import { findService, servicesForGroup } from "./services";
import { maxBookableDate } from "./windows";

export type AgentResult<T> = { ok: true; value: T } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ids = (items: { id: string; name: string }[]) => items.map((i) => `"${i.id}" (${i.name})`).join(", ");

/**
 * Reads an agent's tool input, which nothing has checked: blank strings count as absent, anything of the wrong type
 * is noted in `problems` and read as absent.
 */
export function readInput(input: Record<string, unknown>) {
  const problems: string[] = [];
  const string = (key: string): string | null => {
    const v = input[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") {
      problems.push(`${key} must be a string`);
      return null;
    }
    return v.trim() || null;
  };
  const strings = (key: string): string[] => {
    const v = input[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      problems.push(`${key} must be an array of strings`);
      return [];
    }
    return [...new Set((v as string[]).map((s) => s.trim()).filter(Boolean))];
  };
  const boolean = (key: string): boolean | null => {
    const v = input[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== "boolean") {
      problems.push(`${key} must be true or false`);
      return null;
    }
    return v;
  };
  const object = (key: string): Record<string, unknown> | null => {
    const v = input[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== "object" || Array.isArray(v)) {
      problems.push(`${key} must be an object`);
      return null;
    }
    return v as Record<string, unknown>;
  };
  return { string, strings, boolean, object, problems };
}

export type AgentSelectionInput = {
  groupId: string | null;
  serviceId: string | null;
  optionId: string | null;
  addonIds: string[];
  resourceId: string | null;
  date: string | null;
  time: string | null;
};

/**
 * An agent's choices as the flow's selection, checked the way the steps check them: a group when the business has
 * groups, a service the group may book, an option when there are options (the only one when there's one), add-ons
 * of the service, a resource when there's a choice ("any" when not given), and a bookable date and time (either
 * may be left out; a time needs a date). `nowTime` is "HH:mm" in the business's zone.
 */
export function agentSelection(
  business: PublicBusiness,
  services: PublicService[],
  input: AgentSelectionInput,
  now: { today: PlainDate; nowTime: string },
): AgentResult<Selection> {
  const group = chooseGroup(business, input.groupId);
  if (!group.ok) return group;
  const groupId = group.value;
  const service = chooseService(services, groupId, input.serviceId);
  if (!service.ok) return service;
  const s = service.value;
  const optionId = chooseOption(s, input.optionId);
  if (!optionId.ok) return optionId;
  const unknownAddon = input.addonIds.find((id) => !s.addons.some((a) => a.id === id));
  if (unknownAddon)
    return fail(
      s.addons.length
        ? `Unknown addonId "${unknownAddon}". Add-ons are ${ids(s.addons)}.`
        : `${s.name} has no add-ons: leave addonIds out.`,
    );
  const resource = chooseResource(s, input.resourceId);
  if (!resource.ok) return resource;
  const when = chooseWhen(business, s, input, now);
  if (!when.ok) return when;
  return {
    ok: true,
    value: {
      groupId,
      serviceId: s.id,
      optionId: optionId.value,
      addonIds: input.addonIds,
      resource: resource.value,
      ...when.value,
    },
  };
}

function chooseGroup(business: PublicBusiness, groupId: string | null): AgentResult<string | null> {
  const groups = business.customerGroups;
  if (groups.length === 0)
    return groupId
      ? fail(`${business.name} has no customer groups: leave groupId out.`)
      : { ok: true, value: null };
  if (!groupId) return fail(`Choose a customer group first. groupId is one of ${ids(groups)}.`);
  if (!groups.some((g) => g.id === groupId))
    return fail(`Unknown groupId "${groupId}". It is one of ${ids(groups)}.`);
  return { ok: true, value: groupId };
}

function chooseService(
  services: PublicService[],
  groupId: string | null,
  serviceId: string | null,
): AgentResult<PublicService> {
  const visible = servicesForGroup(services, groupId);
  if (!serviceId) return fail(`serviceId is required. It is one of ${ids(visible)}.`);
  const service = findService(services, serviceId);
  if (!service) return fail(`Unknown serviceId "${serviceId}". It is one of ${ids(visible)}.`);
  if (!visible.includes(service))
    return fail(`${service.name} can't be booked by that customer group. Choose one of ${ids(visible)}.`);
  return { ok: true, value: service };
}

/** The option: required when there are options, the only one when there's one. */
function chooseOption(service: PublicService, optionId: string | null): AgentResult<string | null> {
  const { options } = service;
  if (options.length === 0)
    return optionId ? fail(`${service.name} has no options: leave optionId out.`) : { ok: true, value: null };
  const chosen = optionId ?? (options.length === 1 ? (options[0]?.id ?? null) : null);
  if (!chosen) return fail(`Choose an option of ${service.name}. optionId is one of ${ids(options)}.`);
  if (!options.some((o) => o.id === chosen))
    return fail(`Unknown optionId "${chosen}". It is one of ${ids(options)}.`);
  return { ok: true, value: chosen };
}

/** Like the steps: a choice only when there is more than one ("any" by default); otherwise the business assigns. */
function chooseResource(service: PublicService, resourceId: string | null): AgentResult<string | null> {
  const resources = service.selectableRequirement?.resources ?? [];
  if (resources.length <= 1)
    return resourceId && resourceId !== ANY_RESOURCE
      ? fail(`${service.name} doesn't offer a choice of who or what: leave resourceId out.`)
      : { ok: true, value: null };
  const chosen = resourceId ?? ANY_RESOURCE;
  if (chosen !== ANY_RESOURCE && !resources.some((r) => r.id === chosen))
    return fail(`Unknown resourceId "${chosen}". It is "${ANY_RESOURCE}" or one of ${ids(resources)}.`);
  return { ok: true, value: chosen };
}

/** A bookable date and time; either may be left out, but a time needs a date. */
function chooseWhen(
  business: PublicBusiness,
  service: PublicService,
  { date, time }: Pick<AgentSelectionInput, "date" | "time">,
  { today, nowTime }: { today: PlainDate; nowTime: string },
): AgentResult<{ date: PlainDate | null; time: string | null }> {
  if (time && !date) return fail("A time needs a date: send date (YYYY-MM-DD) too.");
  if (date && !isRealDate(date)) return fail(`date must be YYYY-MM-DD, not "${date}".`);
  if (time && !isTimeOfDay(time)) return fail(`time must be HH:mm (24-hour), not "${time}".`);
  if (!date) return { ok: true, value: { date: null, time: null } };
  const max = maxBookableDate(today, service, business.policies);
  if (date < today) return fail(`${date} has passed. Today is ${today} (${business.timezone}).`);
  if (date > max) return fail(`${service.name} can be booked up to ${max}, not ${date}.`);
  if (date === today && time && time < nowTime) return fail(`${time} today has passed.`);
  return { ok: true, value: { date, time } };
}

/** "HH:mm", 24-hour. */
export function isTimeOfDay(value: string): boolean {
  return TIME_RE.test(value);
}

function isRealDate(value: string): boolean {
  return isPlainDate(value) && addDaysToPlainDate(value, 0) === value;
}

/** The longest range one availability check covers. */
export const MAX_RANGE_DAYS = 31;

/**
 * The dates an availability check covers: `from` (default today, and never before it) to `to` (default a week on),
 * at most [MAX_RANGE_DAYS] and never past `max`, the last bookable date.
 */
export function availabilityRange(
  from: string | null,
  to: string | null,
  { today, max }: { today: PlainDate; max: PlainDate },
): AgentResult<{ from: PlainDate; to: PlainDate }> {
  for (const [key, value] of [
    ["from", from],
    ["to", to],
  ] as const)
    if (value && !isRealDate(value)) return fail(`${key} must be YYYY-MM-DD, not "${value}".`);
  const start = from && from > today ? from : today;
  if (start > max) return fail(`It can be booked up to ${max}; ${start} is too far ahead.`);
  if (to && to < start) return fail(`to (${to}) is before ${start}.`);
  const limits = [to ?? addDaysToPlainDate(start, 6), addDaysToPlainDate(start, MAX_RANGE_DAYS - 1), max];
  return { ok: true, value: { from: start, to: limits.reduce((a, b) => (b < a ? b : a)) } };
}

/**
 * The details form's values with an agent's merged in: any of name, email, phone and notes, and answers by
 * question id (true/false for a checkbox, one of the choices for a select). Checking what's required and the
 * formats is the form schema's job; this refuses what can't be put in the form at all.
 */
export function agentDetails(
  current: DetailsValues,
  input: Record<string, unknown>,
  questions: Question[],
): AgentResult<DetailsValues> {
  const read = readInput(input);
  const next: DetailsValues = { ...current, answers: { ...current.answers } };
  for (const key of ["name", "email", "phone", "notes"] as const) {
    const v = read.string(key);
    if (v !== null) next[key] = v;
  }
  const answers = read.object("answers") ?? {};
  if (read.problems.length) return fail(read.problems.join("; "));
  for (const [id, raw] of Object.entries(answers)) {
    const q = questions.find((x) => x.id === id);
    if (!q)
      return fail(
        questions.length
          ? `Unknown question "${id}". The questions are ${questions.map((x) => `"${x.id}" (${x.label})`).join(", ")}.`
          : "This service asks no questions: leave answers out (choose the service first if you haven't).",
      );
    if (q.kind === "checkbox") {
      if (typeof raw !== "boolean") return fail(`The answer to "${q.label}" must be true or false.`);
      next.answers[id] = String(raw);
      continue;
    }
    if (typeof raw !== "string" && typeof raw !== "number")
      return fail(`The answer to "${q.label}" must be text.`);
    const value = String(raw).trim();
    if (q.kind === "select" && value && !q.options.includes(value))
      return fail(`The answer to "${q.label}" must be one of: ${q.options.map((o) => `"${o}"`).join(", ")}.`);
    next.answers[id] = value;
  }
  return { ok: true, value: next };
}
