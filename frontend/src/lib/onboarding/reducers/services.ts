import type { BusinessSetup, PaymentMode } from "@/lib/api/types";
import type { ServiceAction, SetupHandlers } from "../actions";
import { normName, uniqueName } from "../keys";
import type { SetupQuestion, SetupService } from "../types";
import { mapAt, mapService, withSetup, without } from "./edit";

/** New services cycle through these (the backend's `SetupInstaller` palette). */
const SERVICE_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#ec4899",
];

/** A sensible starting deposit: ~25% of the price, rounded to a whole currency unit. */
export function suggestedDeposit(cents: number, currency: string): number {
  const unit = currency === "JPY" ? 1 : 100;
  return Math.max(unit, Math.round((cents * 0.25) / unit) * unit);
}

/** A new service: 30 minutes, needing one of any resource, paid like most of the others. */
function newService(s: BusinessSetup): SetupService {
  const modes = s.services.map((x) => x.paymentMode);
  const paymentMode: PaymentMode =
    modes.includes("at_venue") && !modes.includes("full") ? "at_venue" : "full";
  return {
    name: uniqueName(
      "New service",
      s.services.map((x) => x.name),
    ),
    description: null,
    category: null,
    color: SERVICE_COLORS[s.services.length % SERVICE_COLORS.length] ?? "#0ea5e9",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 0,
    paymentMode,
    depositCents: null,
    requiresApproval: false,
    locationType: "business",
    isPublic: true,
    options: [],
    addons: [],
    requirements:
      s.resources.length > 0
        ? [
            {
              label: s.vocabulary.resource,
              quantity: 1,
              customerSelectable: false,
              resourceKeys: s.resources.map((r) => r.key),
            },
          ]
        : [],
    allowedGroupKeys: [],
  };
}

/**
 * Applies [patch] to [old]. Switching to a deposit suggests one; switching away drops it; free means no price.
 */
export function patchService(
  old: SetupService,
  patch: Partial<SetupService>,
  currency: string,
): SetupService {
  const next: SetupService = { ...old, ...patch };
  if (!patch.paymentMode || patch.paymentMode === old.paymentMode) return next;
  if (next.paymentMode === "deposit")
    next.depositCents =
      old.depositCents ?? (next.priceCents > 0 ? suggestedDeposit(next.priceCents, currency) : null);
  else next.depositCents = null;
  if (next.paymentMode === "free") next.priceCents = 0;
  return next;
}

/** Whether a service other than the one at [index] is called [name]. */
function nameTakenByOther(services: SetupService[], index: number, name: string): boolean {
  return services.some((svc, i) => i !== index && normName(svc.name) === normName(name));
}

/**
 * Questions point at services by name, so a rename takes its questions along. While another service still has
 * the old name (typing "Massage 90" passes through "Massage"), the questions are that service's and stay put.
 */
function followRename(
  services: SetupService[],
  index: number,
  questions: SetupQuestion[],
  from: string,
  to: string,
): SetupQuestion[] {
  if (normName(from) === normName(to) || nameTakenByOther(services, index, from)) return questions;
  return questions.map((q) =>
    q.serviceName && normName(q.serviceName) === normName(from) ? { ...q, serviceName: to } : q,
  );
}

export const serviceHandlers: SetupHandlers<ServiceAction> = {
  addService: (draft) => withSetup(draft, (s) => ({ ...s, services: [...s.services, newService(s)] })),
  updateService: (draft, action) =>
    withSetup(draft, (s) => {
      const old = s.services[action.index];
      if (!old) return s;
      const next = patchService(old, action.patch, s.currency);
      const questions =
        action.patch.name === undefined
          ? s.questions
          : followRename(s.services, action.index, s.questions, old.name, next.name);
      return { ...s, services: mapAt(s.services, action.index, () => next), questions };
    }),
  removeService: (draft, action) =>
    withSetup(draft, (s) => {
      const old = s.services[action.index];
      if (!old) return s;
      // Its questions go with it, unless another service of the same name still has them.
      const questions = nameTakenByOther(s.services, action.index, old.name)
        ? s.questions
        : s.questions.filter((q) => !q.serviceName || normName(q.serviceName) !== normName(old.name));
      return { ...s, services: without(s.services, action.index), questions };
    }),
  toggleServiceGroup: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      allowedGroupKeys: svc.allowedGroupKeys.includes(action.groupKey)
        ? svc.allowedGroupKeys.filter((k) => k !== action.groupKey)
        : [...svc.allowedGroupKeys, action.groupKey],
    })),
};
