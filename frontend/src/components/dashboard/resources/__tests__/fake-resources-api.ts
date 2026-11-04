/**
 * A stateful fake of the resources endpoints (resources, weekly rules, overrides, closures) plus the team and customer
 * groups they read, over `mockApi`. Writes change the state, so refetches after a mutation see them. `fail` makes the
 * next matching request answer with an error instead.
 */
import type {
  AvailabilityOverride,
  AvailabilityRule,
  CustomerGroup,
  Resource,
  TeamMember,
} from "@/lib/api/types";
import { json, mockApi } from "@/components/dashboard/test/render";

const BASE = "/v1/businesses/b1";

export function resource(patch: Partial<Resource> = {}): Resource {
  return {
    id: "r1",
    kind: "person",
    name: "Sam Rivers",
    description: null,
    color: "#0e7c70",
    capacity: 1,
    memberId: null,
    isActive: true,
    sortOrder: 0,
    ...patch,
  };
}

export function rule(patch: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule1",
    resourceId: "r1",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    validFrom: null,
    validUntil: null,
    audienceGroupIds: [],
    ...patch,
  };
}

export function override(patch: Partial<AvailabilityOverride> = {}): AvailabilityOverride {
  return {
    id: "o1",
    resourceId: "r1",
    date: "2026-10-12",
    isAvailable: false,
    startTime: null,
    endTime: null,
    reason: null,
    ...patch,
  };
}

export function member(patch: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "m1",
    userId: "u1",
    name: "Avery Morgan",
    email: "owner@example.test",
    role: "owner",
    status: "active",
    resourceId: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

export function group(patch: Partial<CustomerGroup> = {}): CustomerGroup {
  return {
    id: "g1",
    name: "Members",
    description: null,
    restricted: false,
    sortOrder: 0,
    isActive: true,
    ...patch,
  };
}

export const apiError = (
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
) => json({ error: { code, message, fields } }, status);

export type ResourcesState = {
  resources: Resource[];
  rules: Record<string, AvailabilityRule[]>;
  overrides: AvailabilityOverride[];
  closures: AvailabilityOverride[];
  team: TeamMember[];
  groups: CustomerGroup[];
};

type Failure = { method: string; path: RegExp; response: () => Response };

export function fakeResourcesApi(initial: Partial<ResourcesState> = {}) {
  const state: ResourcesState = {
    resources: [],
    rules: {},
    overrides: [],
    closures: [],
    team: [],
    groups: [],
    ...initial,
  };
  const failures: Failure[] = [];
  const requests: { method: string; path: string; body: unknown }[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-new-${++seq}`;

  /** One resource's own routes: change or delete it, its availability, rules and overrides. */
  const resourceRoute = (
    method: string,
    id: string,
    sub: string | undefined,
    input: Record<string, unknown>,
  ) => {
    if (!sub && method === "PATCH") {
      state.resources = state.resources.map((r) => (r.id === id ? { ...r, ...input } : r));
      return state.resources.find((r) => r.id === id);
    }
    if (!sub && method === "DELETE") {
      state.resources = state.resources.filter((r) => r.id !== id);
      return new Response(null, { status: 204 });
    }
    if (sub === "/availability")
      return { rules: state.rules[id] ?? [], overrides: state.overrides.filter((o) => o.resourceId === id) };
    if (sub === "/rules" && method === "PUT") {
      const rules = (input.rules as Omit<AvailabilityRule, "id" | "resourceId">[]).map((r, i) => ({
        ...r,
        id: `rule-${i}`,
        resourceId: id,
      }));
      state.rules[id] = rules;
      return { rules };
    }
    if (sub === "/overrides" && method === "POST") {
      const created = { ...(input as Omit<AvailabilityOverride, "id">), id: nextId("o"), resourceId: id };
      state.overrides.push(created);
      return created;
    }
    return {};
  };

  /** Business-level routes: creating resources and closures, deleting overrides, and the lists. */
  const businessRoute = (method: string, rest: string, input: Record<string, unknown>) => {
    if (rest === "/resources" && method === "POST") {
      const created = { ...(input as Omit<Resource, "id">), id: nextId("r") };
      state.resources.push(created);
      return created;
    }
    if (rest === "/closures" && method === "POST") {
      const created = { ...(input as Omit<AvailabilityOverride, "id">), id: nextId("c"), resourceId: null };
      state.closures.push(created);
      return created;
    }
    const overrideId = /^\/overrides\/([^/]+)$/.exec(rest)?.[1];
    if (overrideId && method === "DELETE") {
      state.overrides = state.overrides.filter((o) => o.id !== overrideId);
      state.closures = state.closures.filter((o) => o.id !== overrideId);
      return new Response(null, { status: 204 });
    }
    const lists: Record<string, unknown> = {
      "/resources": state.resources,
      "/closures": state.closures,
      "/team": state.team,
      "/customer-groups": state.groups,
    };
    return lists[rest] ?? {};
  };

  const fetchMock = mockApi((method, path, body) => {
    requests.push({ method, path, body });
    const failure = failures.findIndex((f) => f.method === method && f.path.test(path));
    const [f] = failure >= 0 ? failures.splice(failure, 1) : [];
    if (f) return f.response();
    if (!path.startsWith(BASE)) return {};
    const rest = path.slice(BASE.length);
    const input = body as Record<string, unknown>;
    const resource = /^\/resources\/([^/]+)(\/.*)?$/.exec(rest);
    if (resource) return resourceRoute(method, resource[1] ?? "", resource[2], input);
    return businessRoute(method, rest, input);
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
