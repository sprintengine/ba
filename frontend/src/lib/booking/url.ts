/**
 * The booking flow's URL state, so refresh, back and share work:
 *   ?group=<id>&service=<id>&option=<id>&addons=<id,id>&with=<resourceId|any>&date=YYYY-MM-DD&time=HH:mm&step=<step>
 * Personal details are never put in the URL.
 */
import type { Selection } from "./selection";
import { isStepId, type StepId } from "./steps";

export type FlowState = Selection & { step: StepId | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Query parameters that belong to the booking flow (`/[slug]/book`). */
const FLOW_PARAM_KEYS = ["group", "service", "option", "addons", "with", "date", "time", "step"] as const;

export function parseFlowParams(params: URLSearchParams): FlowState {
  const str = (key: string) => {
    const v = params.get(key)?.trim();
    return v ? v : null;
  };
  const date = str("date");
  const time = str("time");
  const step = str("step");
  return {
    groupId: str("group"),
    serviceId: str("service"),
    optionId: str("option"),
    addonIds: (str("addons") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    resource: str("with"),
    date: date && DATE_RE.test(date) ? date : null,
    time: time && TIME_RE.test(time) ? time : null,
    step: step && isStepId(step) ? step : null,
  };
}

/** Serialises the flow into a query string (without "?"), in a stable order. */
export function serializeFlowParams(state: FlowState): string {
  const params = new URLSearchParams();
  if (state.groupId) params.set("group", state.groupId);
  if (state.serviceId) params.set("service", state.serviceId);
  if (state.optionId) params.set("option", state.optionId);
  if (state.addonIds.length) params.set("addons", state.addonIds.join(","));
  if (state.resource) params.set("with", state.resource);
  if (state.date) params.set("date", state.date);
  if (state.time) params.set("time", state.time);
  if (state.step) params.set("step", state.step);
  return params.toString();
}

/**
 * Booking deep links used to live on `/[slug]` (`?service=…`). When any flow parameter is present,
 * returns the equivalent `/[slug]/book?…` URL, else null.
 */
export function bookingDeepLink(
  slug: string,
  query: Record<string, string | string[] | undefined>,
): string | null {
  const params = new URLSearchParams();
  for (const key of FLOW_PARAM_KEYS) {
    const value = query[key];
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `/${encodeURIComponent(slug)}/book?${qs}` : null;
}

/**
 * `/[slug]/book` with every parameter of `query` kept (`?preview=1`, flow state, campaign tags): where `/[slug]` sends
 * visitors when the business has no site, which is every business unless websites are switched on.
 */
export function bookingPortalPath(
  slug: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : [value]) if (v !== undefined) params.append(key, v);
  }
  const qs = params.toString();
  return `/${encodeURIComponent(slug)}/book${qs ? `?${qs}` : ""}`;
}
