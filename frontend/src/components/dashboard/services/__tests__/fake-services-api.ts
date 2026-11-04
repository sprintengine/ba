/**
 * A stateful fake of the services endpoints, plus the resources, customer groups and questions the service editor
 * reads, over `mockApi`. Writes change the state, so refetches after a mutation see them. `fail` makes the next
 * matching request answer with an error instead.
 */
import type { CustomerGroup, FormQuestion, Resource, Service, ServiceInput } from "@/lib/api/types";
import { mockApi } from "@/components/dashboard/test/render";

const BASE = "/v1/businesses/b1";

export function service(patch: Partial<Service> = {}): Service {
  return {
    id: "s1",
    name: "Initial assessment",
    description: null,
    category: null,
    color: "#0e7c70",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 6500,
    paymentMode: "full",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    allowedGroupIds: [],
    isPublic: true,
    isActive: true,
    sortOrder: 0,
    options: [],
    addons: [],
    requirements: [],
    ...patch,
  };
}

export function question(patch: Partial<FormQuestion> = {}): FormQuestion {
  return {
    id: "q1",
    serviceId: null,
    label: "Any injuries?",
    helpText: null,
    kind: "text",
    options: [],
    required: false,
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    ...patch,
  };
}

export type ServicesState = {
  services: Service[];
  resources: Resource[];
  groups: CustomerGroup[];
  questions: FormQuestion[];
};

type Failure = { method: string; path: RegExp; response: () => Response };

/** A `Service` from what the editor sent: ids for new items, as the backend gives them. */
function fromInput(id: string, input: ServiceInput): Service {
  return {
    ...input,
    id,
    options: input.options.map((o, i) => ({ ...o, id: o.id ?? `${id}-o${i}` })),
    addons: input.addons.map((a, i) => ({ ...a, id: a.id ?? `${id}-a${i}` })),
    requirements: input.requirements.map((r, i) => ({ ...r, id: r.id ?? `${id}-q${i}` })),
  };
}

export function fakeServicesApi(initial: Partial<ServicesState> = {}) {
  const state: ServicesState = { services: [], resources: [], groups: [], questions: [], ...initial };
  const failures: Failure[] = [];
  const requests: { method: string; path: string; body: unknown }[] = [];
  let seq = 0;

  const fetchMock = mockApi((method, path, body) => {
    requests.push({ method, path, body });
    const failure = failures.findIndex((f) => f.method === method && f.path.test(path));
    if (failure >= 0) {
      const [f] = failures.splice(failure, 1);
      if (f) return f.response();
    }
    const rest = path.startsWith(BASE) ? path.slice(BASE.length) : path;
    if (rest === "/services" && method === "GET") return state.services;
    if (rest === "/services" && method === "POST") {
      const created = fromInput(`s-new-${++seq}`, body as ServiceInput);
      state.services.push(created);
      return created;
    }
    const match = /^\/services\/([^/]+)$/.exec(rest);
    if (match) {
      const id = match[1] ?? "";
      if (method === "PUT") {
        const replaced = fromInput(id, body as ServiceInput);
        state.services = state.services.map((s) => (s.id === id ? replaced : s));
        return replaced;
      }
      if (method === "DELETE") {
        state.services = state.services.filter((s) => s.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (rest === "/resources") return state.resources;
    if (rest === "/customer-groups") return state.groups;
    if (rest === "/questions") return state.questions;
    return {};
  });

  return {
    state,
    requests,
    fetchMock,
    /** The next `method` request whose path matches answers with [response] (once). */
    fail(method: string, path: RegExp, response: () => Response) {
      failures.push({ method, path, response });
    },
    /** The bodies of the `method` requests to paths ending with [suffix]. */
    bodies(method: string, suffix: string) {
      return requests.filter((r) => r.method === method && r.path.endsWith(suffix)).map((r) => r.body);
    },
  };
}
