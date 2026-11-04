/**
 * A stateful fake of the team endpoints (members, invitations) plus the resources the team page reads, over
 * `mockApi`. Writes change the state, so refetches after a mutation see them. `fail` makes the next matching request
 * answer with an error instead.
 */
import type { Resource, TeamInvitationInput, TeamMember, UpdateTeamMemberInput } from "@/lib/api/types";
import { mockApi } from "@/components/dashboard/test/render";

export { apiError, member, resource } from "@/components/dashboard/resources/__tests__/fake-resources-api";

const BASE = "/v1/businesses/b1";

type Failure = { method: string; path: RegExp; response: () => Response };

export function fakeTeamApi(initial: { team?: TeamMember[]; resources?: Resource[] } = {}) {
  const state = { team: [...(initial.team ?? [])], resources: [...(initial.resources ?? [])] };
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
    if (rest === "/team" && method === "GET") return state.team;
    if (rest === "/team/invitations" && method === "POST") {
      const input = body as TeamInvitationInput;
      const invited: TeamMember = {
        id: `m-new-${++seq}`,
        userId: null,
        name: null,
        email: input.email,
        role: input.role,
        status: "invited",
        resourceId: input.resourceId ?? null,
        createdAt: "2026-10-01T09:00:00Z",
      };
      state.team.push(invited);
      return invited;
    }
    const match = /^\/team\/([^/]+)$/.exec(rest);
    if (match) {
      const id = match[1] ?? "";
      if (method === "PATCH") {
        state.team = state.team.map((m) => (m.id === id ? { ...m, ...(body as UpdateTeamMemberInput) } : m));
        return state.team.find((m) => m.id === id);
      }
      if (method === "DELETE") {
        state.team = state.team.filter((m) => m.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (rest === "/resources") return state.resources;
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
