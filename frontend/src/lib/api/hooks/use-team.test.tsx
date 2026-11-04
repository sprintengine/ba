/** Team members and invitations: requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInviteTeamMember, useRemoveTeamMember, useTeam, useUpdateTeamMember } from "./use-team";
import { BIZ, json, keyNames, noContent, renderApiHook, stubApi } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;

describe("team", () => {
  // Members link to resources (and the resources' availability), and the caller's own role is in me and the business.
  const refreshed = keyNames("detail", "resources", "resourceAvailability", "team", "me");

  it("useTeam GETs the members, once there is a business", async () => {
    const api = stubApi({ [`GET ${base}/team`]: json([{ id: "m1" }]) });
    const { result } = renderApiHook(() => ({ team: useTeam(BIZ), none: useTeam("") }));
    await waitFor(() => expect(result.current.team.data).toEqual([{ id: "m1" }]));
    expect(result.current.none.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(1);
  });

  it("invite POSTs the invitation and refreshes members, resources, the business and me", async () => {
    const invite = { email: "sam@example.com", role: "staff" as const, resourceId: "r1" };
    const api = stubApi({ [`POST ${base}/team/invitations`]: json({ id: "m2", status: "invited" }) });
    const view = renderApiHook(() => useInviteTeamMember(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(invite));

    expect(api.last().body).toEqual(invite);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("update PATCHes and swaps the member in the cached list", async () => {
    const api = stubApi({ [`PATCH ${base}/team/m1`]: json({ id: "m1", role: "admin" }) });
    const view = renderApiHook(() => useUpdateTeamMember(BIZ), {
      seed: true,
      seedData: {
        team: [
          { id: "m1", role: "staff" },
          { id: "m2", role: "owner" },
        ],
      },
    });

    await act(() => view.result.current.mutateAsync({ id: "m1", input: { role: "admin" } }));

    expect(api.last().body).toEqual({ role: "admin" });
    expect(view.data("team")).toEqual([
      { id: "m1", role: "admin" },
      { id: "m2", role: "owner" },
    ]);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("remove DELETEs and drops the member from the cached list", async () => {
    stubApi({ [`DELETE ${base}/team/m1`]: noContent });
    const view = renderApiHook(() => useRemoveTeamMember(BIZ), {
      seed: true,
      seedData: { team: [{ id: "m1" }, { id: "m2" }] },
    });

    await act(() => view.result.current.mutateAsync("m1"));

    expect(view.data("team")).toEqual([{ id: "m2" }]);
    expect(view.invalidated()).toEqual(refreshed);
  });
});
