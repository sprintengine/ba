/** Which steps the public booking flow has, which are complete, and which one to show. Pure. */
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { ANY_RESOURCE, type Selection } from "./selection";
import { findService, servicesForGroup } from "./services";

export type StepId = "group" | "service" | "extras" | "resource" | "time" | "details" | "review";

const STEP_IDS: readonly StepId[] = ["group", "service", "extras", "resource", "time", "details", "review"];

export function isStepId(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

function hasGroupStep(business: Pick<PublicBusiness, "customerGroups">) {
  return business.customerGroups.length > 0;
}
function hasExtrasStep(service: PublicService | null | undefined) {
  return !!service && (service.options.length > 0 || service.addons.length > 0);
}
/** The customer picks a resource only when the service has a selectable requirement with a real choice. */
function selectableResources(service: PublicService | null | undefined) {
  const resources = service?.selectableRequirement?.resources ?? [];
  return resources.length > 1 ? resources : null;
}

/** The ordered steps for this business and (possibly unselected) service. */
export function getSteps(
  business: Pick<PublicBusiness, "customerGroups">,
  service: PublicService | null | undefined,
): StepId[] {
  const steps: StepId[] = [];
  if (hasGroupStep(business)) steps.push("group");
  steps.push("service");
  if (hasExtrasStep(service)) steps.push("extras");
  if (selectableResources(service)) steps.push("resource");
  steps.push("time", "details", "review");
  return steps;
}

/**
 * How many steps the progress shows. Once a service is chosen, its steps. Before, the most any of `services` can
 * take, and `known` only when they all take the same: a "Step 1 of 5" that becomes "Step 2 of 7" is worse than
 * "Step 1".
 */
export function stepTotal(
  business: Pick<PublicBusiness, "customerGroups">,
  services: PublicService[],
  service: PublicService | null,
): { total: number; known: boolean } {
  const own = getSteps(business, service).length;
  if (service || services.length === 0) return { total: own, known: true };
  const counts = services.map((s) => getSteps(business, s).length);
  const total = Math.max(...counts);
  return { total, known: counts.every((c) => c === total) };
}

export type FlowContext = {
  business: Pick<PublicBusiness, "customerGroups">;
  services: PublicService[];
  /** Whether the details form currently holds valid values (it is not in the URL). */
  detailsComplete: boolean;
};

/** Is the given step's own choice made (and valid)? */
export function isStepComplete(step: StepId, sel: Selection, ctx: FlowContext): boolean {
  const service = findService(ctx.services, sel.serviceId);
  switch (step) {
    case "group":
      return !hasGroupStep(ctx.business) || ctx.business.customerGroups.some((g) => g.id === sel.groupId);
    case "service":
      return !!service && servicesForGroup(ctx.services, sel.groupId).includes(service);
    case "extras":
      return !!service && extrasComplete(service, sel);
    case "resource": {
      const resources = selectableResources(service);
      return !resources || sel.resource === ANY_RESOURCE || resources.some((r) => r.id === sel.resource);
    }
    case "time":
      return !!sel.date && !!sel.time;
    case "details":
      return ctx.detailsComplete;
    case "review":
      return false;
  }
}

/** An option is chosen when the service has options, and every chosen add-on belongs to the service. */
function extrasComplete(service: PublicService, sel: Selection): boolean {
  if (service.options.length > 0 && !service.options.some((o) => o.id === sel.optionId)) return false;
  return sel.addonIds.every((id) => service.addons.some((a) => a.id === id));
}

/**
 * The step to show: the requested one if every earlier step is complete,
 * otherwise the first incomplete step. With no request, the first incomplete step.
 */
export function resolveStep(requested: StepId | null, sel: Selection, ctx: FlowContext): StepId {
  const steps = getSteps(ctx.business, findService(ctx.services, sel.serviceId));
  const firstIncomplete = steps.find((s) => !isStepComplete(s, sel, ctx)) ?? "review";
  if (!requested || !steps.includes(requested)) return firstIncomplete;
  return steps.indexOf(requested) <= steps.indexOf(firstIncomplete) ? requested : firstIncomplete;
}

export function nextStep(current: StepId, steps: StepId[]): StepId {
  const i = steps.indexOf(current);
  return steps[Math.min(i + 1, steps.length - 1)] ?? current;
}

export function previousStep(current: StepId, steps: StepId[]): StepId | null {
  const i = steps.indexOf(current);
  if (i <= 0) return null;
  return steps[i - 1] ?? null;
}

/** Times can be shown once a service is chosen and its extras (if any) and resource choice are complete. */
export function canPickTime(sel: Selection, ctx: FlowContext): boolean {
  const service = findService(ctx.services, sel.serviceId);
  if (!service) return false;
  const extrasDone = !hasExtrasStep(service) || isStepComplete("extras", sel, ctx);
  return extrasDone && isStepComplete("resource", sel, ctx);
}
