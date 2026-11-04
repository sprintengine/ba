/**
 * Client-side mirror of the backend's setup validation (`SetupInstaller.validate` + `validateService`). Returns a
 * field path → message map using the backend's paths (`services[0].depositCents`), so API `fields` errors and client
 * errors share one shape. Messages are friendlier than the server's; the rules and limits are the same.
 */
import type { BusinessSetup } from "@/lib/api/types";
import { QUESTION_KINDS } from "@/lib/catalog/questions";
import { RESOURCE_KINDS } from "@/lib/catalog/resources";
import { LOCATION_TYPES, PAYMENT_MODES } from "@/lib/catalog/services";
import { timeToMinutes } from "@/lib/format/datetime";
import { isValidTimeZone } from "@/lib/format/timezones";
import { slugProblem } from "@/lib/slug";
import { HEX_COLOR } from "@/lib/theme/color";
import { choicesProblem } from "@/lib/validation/questions";
import { depositProblem } from "@/lib/validation/services";
import {
  BUSINESS_LIMITS,
  GROUP_LIMITS,
  POLICY_LIMITS,
  QUESTION_LIMITS,
  RESOURCE_LIMITS,
  SERVICE_LIMITS,
  type Range,
} from "@/lib/validation/limits";
import { normName } from "./keys";
import type { SetupErrors, SetupResource, SetupService } from "./types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const VOCABULARY_WORDS = ["resource", "resources", "customer", "customers", "booking", "bookings"] as const;
const COLOR_MESSAGE = "Must be a hex colour like #4f46e5";
const PRICE_MESSAGE = "Enter a price";

/** Collects the first problem per path (like the backend's `Validator`). */
class Collector {
  readonly errors: SetupErrors = {};
  add(path: string, message: string) {
    if (!(path in this.errors)) this.errors[path] = message;
  }
  text(value: string | null | undefined, path: string, max: number, required: string | false) {
    const v = value?.trim() ?? "";
    if (!v) {
      if (required) this.add(path, required);
      return;
    }
    if (v.length > max) this.add(path, `Keep it under ${max} characters`);
    else if (CONTROL.test(v)) this.add(path, "Contains invalid characters");
  }
  range(value: number | null | undefined, path: string, { min, max }: Range, message?: string) {
    if (value === null || value === undefined) return;
    if (!Number.isInteger(value) || value < min || value > max)
      this.add(path, message ?? `Must be between ${min} and ${max}`);
  }
  time(value: string, path: string) {
    if (!TIME.test(value)) {
      this.add(path, "Use a time like 09:00");
      return null;
    }
    return timeToMinutes(value);
  }
  /** Flags [path] when [keys] has duplicates. */
  unique(keys: string[], path: string, message: string) {
    if (new Set(keys).size !== keys.length) this.add(path, message);
  }
}

/** Everything a setup needs to be created. Returns `{}` when the setup can be created. */
export function validateSetup(setup: BusinessSetup): SetupErrors {
  const v = new Collector();
  const context: Context = {
    v,
    resourceNoun: setup.vocabulary.resource.trim().toLowerCase() || "resource",
    groupKeys: setup.customerGroups.map((g) => g.key),
    resourceKeys: setup.resources.map((r) => r.key),
  };
  validateBusiness(v, setup);
  validateGroups(v, setup);
  validateResources(context, setup.resources);
  validateServices(context, setup.services);
  validateQuestions(v, setup);
  return v.errors;
}

type Context = { v: Collector; resourceNoun: string; groupKeys: string[]; resourceKeys: string[] };

function validateBusiness(v: Collector, setup: BusinessSetup) {
  v.text(setup.name, "name", BUSINESS_LIMITS.name, "Enter your business name");
  if (setup.slug !== null) {
    const problem = slugProblem(setup.slug);
    if (problem) v.add("slug", setup.slug ? problem : "Choose a web address");
  }
  v.text(setup.industry, "industry", BUSINESS_LIMITS.industry, "Required");
  v.text(setup.description, "description", BUSINESS_LIMITS.description, false);
  if (!isValidTimeZone(setup.timezone))
    v.add("timezone", setup.timezone ? "Unknown timezone" : "Choose a timezone");
  if (!/^[A-Z]{3}$/.test(setup.currency)) v.add("currency", "Choose a currency");
  if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(setup.locale)) v.add("locale", "Must be a locale like en-IE");
  if (!/^[A-Z]{2}$/.test(setup.country)) v.add("country", "Must be a country code like IE");
  for (const k of VOCABULARY_WORDS) {
    v.text(setup.vocabulary[k], `vocabulary.${k}`, BUSINESS_LIMITS.vocabularyWord, "Required");
  }
  if (!HEX_COLOR.test(setup.branding.primaryColor)) v.add("branding.primaryColor", COLOR_MESSAGE);
  const p = setup.policies;
  v.range(p.minNoticeMinutes, "policies.minNoticeMinutes", POLICY_LIMITS.minNoticeMinutes);
  v.range(p.maxAdvanceDays, "policies.maxAdvanceDays", POLICY_LIMITS.maxAdvanceDays);
  v.range(
    p.cancellationNoticeHours,
    "policies.cancellationNoticeHours",
    POLICY_LIMITS.cancellationNoticeHours,
  );
  v.range(
    p.lateCancellationRefundPercent,
    "policies.lateCancellationRefundPercent",
    POLICY_LIMITS.lateCancellationRefundPercent,
  );
  v.range(p.holdMinutes, "policies.holdMinutes", POLICY_LIMITS.holdMinutes);
}

function validateGroups(v: Collector, setup: BusinessSetup) {
  v.unique(
    setup.customerGroups.map((g) => g.key),
    "customerGroups",
    "Group keys must be unique",
  );
  const names = new Set<string>();
  setup.customerGroups.forEach((g, i) => {
    v.text(g.key, `customerGroups[${i}].key`, GROUP_LIMITS.key, "Required");
    v.text(g.name, `customerGroups[${i}].name`, GROUP_LIMITS.name, "Give this group a name");
    v.text(g.description, `customerGroups[${i}].description`, GROUP_LIMITS.description, false);
    const n = normName(g.name);
    if (n && names.has(n)) v.add(`customerGroups[${i}].name`, "Another group has this name");
    names.add(n);
  });
}

function validateResources(
  { v, resourceNoun, groupKeys, resourceKeys }: Context,
  resources: SetupResource[],
) {
  v.unique(resourceKeys, "resources", "Resource keys must be unique");
  if (resources.length > RESOURCE_LIMITS.perSetup)
    v.add("resources", `At most ${RESOURCE_LIMITS.perSetup} resources`);
  const { min, max } = RESOURCE_LIMITS.capacity;
  resources.forEach((r, i) => {
    const pre = `resources[${i}].`;
    v.text(r.key, `${pre}key`, RESOURCE_LIMITS.key, "Required");
    if (!RESOURCE_KINDS.includes(r.kind)) v.add(`${pre}kind`, "Choose a kind");
    v.text(r.name, `${pre}name`, RESOURCE_LIMITS.name, `Give this ${resourceNoun} a name`);
    v.text(r.description, `${pre}description`, RESOURCE_LIMITS.description, false);
    v.range(
      r.capacity,
      `${pre}capacity`,
      RESOURCE_LIMITS.capacity,
      `Capacity must be between ${min} and ${max}`,
    );
    r.weeklyHours.forEach((h, j) => {
      const q = `${pre}weeklyHours[${j}].`;
      v.range(h.dayOfWeek, `${q}dayOfWeek`, { min: 1, max: 7 });
      const start = v.time(h.startTime, `${q}startTime`);
      const end = v.time(h.endTime, `${q}endTime`);
      if (start !== null && end !== null && end <= start)
        v.add(`${q}endTime`, "Closing time must be after opening time");
      for (const k of h.audienceGroupKeys) {
        if (!groupKeys.includes(k)) v.add(`${q}audienceGroupKeys`, `Unknown group '${k}'`);
      }
    });
  });
}

function validateServices(context: Context, services: SetupService[]) {
  const { v } = context;
  if (services.length > SERVICE_LIMITS.perSetup)
    v.add("services", `At most ${SERVICE_LIMITS.perSetup} services`);
  const names = new Set<string>();
  services.forEach((s, i) => {
    const pre = `services[${i}].`;
    const n = normName(s.name);
    validateService(v, s, pre);
    if (n && names.has(n)) v.add(`${pre}name`, "Another service has this name");
    names.add(n);
    validateOptionsAndAddons(v, s, pre);
    validateRequirements(context, s, pre);
    for (const k of s.allowedGroupKeys) {
      if (!context.groupKeys.includes(k)) v.add(`${pre}allowedGroupKeys`, `Unknown group '${k}'`);
    }
  });
}

/** `validateService`: the service's own fields. */
function validateService(v: Collector, s: SetupService, pre: string) {
  const L = SERVICE_LIMITS;
  v.text(s.name, `${pre}name`, L.name, "Give this service a name");
  v.text(s.description, `${pre}description`, L.description, false);
  v.text(s.category, `${pre}category`, L.category, false);
  if (!HEX_COLOR.test(s.color)) v.add(`${pre}color`, COLOR_MESSAGE);
  v.range(
    s.durationMinutes,
    `${pre}durationMinutes`,
    L.durationMinutes,
    "Duration must be between 5 minutes and 24 hours",
  );
  v.range(s.bufferBeforeMinutes, `${pre}bufferBeforeMinutes`, L.bufferMinutes);
  v.range(s.bufferAfterMinutes, `${pre}bufferAfterMinutes`, L.bufferMinutes);
  v.range(s.slotIntervalMinutes, `${pre}slotIntervalMinutes`, L.slotIntervalMinutes);
  v.range(s.minNoticeMinutes, `${pre}minNoticeMinutes`, L.minNoticeMinutes);
  v.range(s.maxAdvanceDays, `${pre}maxAdvanceDays`, L.maxAdvanceDays);
  v.range(
    s.capacity,
    `${pre}capacity`,
    L.capacity,
    `Capacity must be between ${L.capacity.min} and ${L.capacity.max}`,
  );
  v.range(s.priceCents, `${pre}priceCents`, L.priceCents, PRICE_MESSAGE);
  if (!PAYMENT_MODES.includes(s.paymentMode)) v.add(`${pre}paymentMode`, "Choose how customers pay");
  if (!LOCATION_TYPES.includes(s.locationType)) v.add(`${pre}locationType`, "Choose a location");
  const deposit = depositProblem(s);
  if (deposit) v.add(`${pre}depositCents`, deposit);
}

function validateOptionsAndAddons(v: Collector, s: SetupService, pre: string) {
  const L = SERVICE_LIMITS;
  const { min, max } = L.optionDurationMinutes;
  if (s.options.length > L.options) v.add(`${pre}options`, `At most ${L.options} options`);
  s.options.forEach((o, j) => {
    const at = `${pre}options[${j}].`;
    v.text(o.name, `${at}name`, L.optionName, "Name this option");
    v.text(o.description, `${at}description`, L.optionDescription, false);
    v.range(
      o.durationMinutes,
      `${at}durationMinutes`,
      L.optionDurationMinutes,
      `Between ${min} and ${max} minutes`,
    );
    v.range(o.priceCents, `${at}priceCents`, L.priceCents, PRICE_MESSAGE);
  });
  const extra = L.addonExtraMinutes;
  if (s.addons.length > L.addons) v.add(`${pre}addons`, `At most ${L.addons} add-ons`);
  s.addons.forEach((a, j) => {
    const at = `${pre}addons[${j}].`;
    v.text(a.name, `${at}name`, L.addonName, "Name this add-on");
    v.text(a.description, `${at}description`, L.addonDescription, false);
    v.range(a.extraMinutes, `${at}extraMinutes`, extra, `Between ${extra.min} and ${extra.max} minutes`);
    v.range(a.priceCents, `${at}priceCents`, L.priceCents, PRICE_MESSAGE);
  });
}

function validateRequirements({ v, resourceNoun, resourceKeys }: Context, s: SetupService, pre: string) {
  const L = SERVICE_LIMITS;
  if (s.requirements.length > L.requirements)
    v.add(`${pre}requirements`, `At most ${L.requirements} requirements`);
  if (s.requirements.filter((r) => r.customerSelectable).length > 1)
    v.add(`${pre}requirements`, "Only one requirement can be customer-selectable");
  s.requirements.forEach((r, j) => {
    const q = `${pre}requirements[${j}].`;
    v.text(r.label, `${q}label`, L.requirementLabel, "Required");
    v.range(r.quantity, `${q}quantity`, L.requirementQuantity);
    const pool = new Set(r.resourceKeys);
    if (pool.size === 0) v.add(`${q}resourceKeys`, `Choose at least one ${resourceNoun}`);
    for (const k of r.resourceKeys) {
      if (!resourceKeys.includes(k)) v.add(`${q}resourceKeys`, `Unknown ${resourceNoun} '${k}'`);
    }
    if (pool.size > 0 && pool.size < r.quantity)
      v.add(`${q}quantity`, `Needs at least ${r.quantity} in the pool`);
  });
}

function validateQuestions(v: Collector, setup: BusinessSetup) {
  const serviceNames = new Set(setup.services.map((s) => normName(s.name)));
  setup.questions.forEach((q, i) => {
    const pre = `questions[${i}].`;
    v.text(q.label, `${pre}label`, QUESTION_LIMITS.label, "Write the question");
    v.text(q.helpText, `${pre}helpText`, QUESTION_LIMITS.helpText, false);
    if (!QUESTION_KINDS.includes(q.kind)) v.add(`${pre}kind`, "Choose an answer type");
    const choices = q.kind === "select" || q.options.length > 0 ? choicesProblem(q.options) : null;
    if (choices) v.add(`${pre}options`, choices);
    if (q.serviceName && !serviceNames.has(normName(q.serviceName)))
      v.add(`${pre}serviceName`, `Unknown service '${q.serviceName}'`);
  });
}
