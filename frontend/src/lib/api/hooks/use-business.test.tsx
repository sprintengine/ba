/** Business settings, customer groups and questions: requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerGroupInput, FormQuestionInput } from "../types";
import {
  useBusiness,
  useCreateCustomerGroup,
  useCreateQuestion,
  useCustomerGroups,
  useDeleteBusiness,
  useDeleteCustomerGroup,
  useDeleteQuestion,
  useOverview,
  useQuestions,
  useUpdateBusiness,
  useUpdateCustomerGroup,
  useUpdateQuestion,
} from "./use-business";
import {
  BIZ,
  BUSINESS,
  MARKETPLACE,
  PUBLIC,
  fail,
  json,
  keyNames,
  noContent,
  renderApiHook,
  stubApi,
  type QueryView,
} from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;

describe("business queries", () => {
  it.each([
    ["useBusiness", () => useBusiness(BIZ), "", { id: BIZ }],
    ["useOverview", () => useOverview(BIZ), "/overview", { checklist: [] }],
    ["useCustomerGroups", () => useCustomerGroups(BIZ), "/customer-groups", [{ id: "g1" }]],
    ["useQuestions", () => useQuestions(BIZ), "/questions", [{ id: "q1" }]],
  ] as const)("%s GETs %s under the business", async (_name, hook, path, body) => {
    const api = stubApi({ [`GET ${base}${path}`]: json(body) });
    const { result } = renderApiHook<QueryView>(hook);
    await waitFor(() => expect(result.current.data).toEqual(body));
    expect(api.calls).toHaveLength(1);
  });

  it("useOverview loads afresh when the business's day changes", async () => {
    const api = stubApi({ [`GET ${base}/overview`]: json({ checklist: [] }) });
    let today = "2026-10-07";
    const view = renderApiHook(() => useOverview(BIZ, today));
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    view.rerender();
    expect(api.calls).toHaveLength(1);

    today = "2026-10-08";
    view.rerender();
    await waitFor(() => expect(api.calls).toHaveLength(2));
  });

  it.each([
    ["useOverview", () => useOverview("")],
    ["useCustomerGroups", () => useCustomerGroups("")],
    ["useQuestions", () => useQuestions("")],
  ] as const)("%s waits for a business id", (_name, hook) => {
    const api = stubApi();
    const { result } = renderApiHook<QueryView>(hook);
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("encodes the business id as one path segment", async () => {
    const api = stubApi({ "GET /v1/businesses/a%2Fb": json({ id: "a/b" }) });
    const { result } = renderApiHook(() => useBusiness("a/b"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.last().path).toBe("/v1/businesses/a%2Fb");
  });

  it("surfaces an ApiError", async () => {
    stubApi({ [`GET ${base}`]: fail(403, "FORBIDDEN", "Not yours") });
    const { result } = renderApiHook(() => useBusiness(BIZ));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.isForbidden).toBe(true);
    expect(result.current.error?.message).toBe("Not yours");
  });
});

describe("useUpdateBusiness", () => {
  it("PATCHes, stores the business and refreshes everything that shows it", async () => {
    const updated = { id: BIZ, name: "Renamed" };
    const api = stubApi({ [`PATCH ${base}`]: json(updated) });
    const view = renderApiHook(() => useUpdateBusiness(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync({ name: "Renamed" }));

    expect(api.last().body).toEqual({ name: "Renamed" });
    expect(view.data("detail")).toEqual(updated);
    // Timezone and policies change staff slots; name, address and branding show on public pages and listings.
    expect(view.invalidated()).toEqual(
      keyNames("overview", "staffAvailability", "me", ...PUBLIC, ...MARKETPLACE),
    );
  });

  it("leaves the cache untouched when the update is rejected", async () => {
    stubApi({ [`PATCH ${base}`]: fail(409, "SLUG_TAKEN", "Taken", { slug: "taken" }) });
    const view = renderApiHook(() => useUpdateBusiness(BIZ), { seed: true });

    await act(async () => {
      await expect(view.result.current.mutateAsync({ slug: "x" })).rejects.toMatchObject({
        code: "SLUG_TAKEN",
        fields: { slug: "taken" },
      });
    });

    expect(view.data("detail")).toEqual({});
    expect(view.invalidated()).toEqual([]);
  });
});

describe("useDeleteBusiness", () => {
  it("DELETEs, drops every cached query of the business and refreshes me", async () => {
    const api = stubApi({ [`DELETE ${base}`]: noContent });
    const view = renderApiHook(() => useDeleteBusiness(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync());

    expect(api.calls).toHaveLength(1);
    expect(view.removed()).toEqual(BUSINESS);
    expect(view.invalidated()).toEqual(["me"]);
  });
});

const groupInput: CustomerGroupInput = { name: "Members", description: null } as CustomerGroupInput;

describe("customer groups", () => {
  // Groups are embedded in the business (and its public page), so both refresh with the list.
  const refreshed = keyNames("detail", "customerGroups", ...PUBLIC);

  it("create POSTs and refreshes the groups, the business and public pages", async () => {
    const api = stubApi({ [`POST ${base}/customer-groups`]: json({ id: "g2", ...groupInput }) });
    const view = renderApiHook(() => useCreateCustomerGroup(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(groupInput));

    expect(api.last().body).toEqual(groupInput);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("update PATCHes and swaps the group in the cached list", async () => {
    const api = stubApi({ [`PATCH ${base}/customer-groups/g1`]: json({ id: "g1", name: "VIP" }) });
    const view = renderApiHook(() => useUpdateCustomerGroup(BIZ), {
      seed: true,
      seedData: {
        customerGroups: [
          { id: "g1", name: "Members" },
          { id: "g2", name: "Staff" },
        ],
      },
    });

    await act(() => view.result.current.mutateAsync({ id: "g1", input: { name: "VIP" } }));

    expect(api.last()).toMatchObject({ method: "PATCH", body: { name: "VIP" } });
    expect(view.data("customerGroups")).toEqual([
      { id: "g1", name: "VIP" },
      { id: "g2", name: "Staff" },
    ]);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("delete DELETEs and removes the group from the cached list", async () => {
    stubApi({ [`DELETE ${base}/customer-groups/g1`]: noContent });
    const view = renderApiHook(() => useDeleteCustomerGroup(BIZ), {
      seed: true,
      seedData: { customerGroups: [{ id: "g1" }, { id: "g2" }] },
    });

    await act(() => view.result.current.mutateAsync("g1"));

    expect(view.data("customerGroups")).toEqual([{ id: "g2" }]);
    expect(view.invalidated()).toEqual(refreshed);
  });
});

const questionInput = { label: "Any injuries?", kind: "text" } as unknown as FormQuestionInput;

describe("questions", () => {
  // Questions are asked on the public booking form.
  const refreshed = keyNames("questions", ...PUBLIC);

  it("create POSTs and refreshes the questions and public pages", async () => {
    const api = stubApi({ [`POST ${base}/questions`]: json({ id: "q2" }) });
    const view = renderApiHook(() => useCreateQuestion(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(questionInput));

    expect(api.last().body).toEqual(questionInput);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("update PATCHes and swaps the question in the cached list", async () => {
    stubApi({ [`PATCH ${base}/questions/q1`]: json({ id: "q1", label: "New" }) });
    const view = renderApiHook(() => useUpdateQuestion(BIZ), {
      seed: true,
      seedData: { questions: [{ id: "q1", label: "Old" }] },
    });

    await act(() => view.result.current.mutateAsync({ id: "q1", input: { label: "New" } }));

    expect(view.data("questions")).toEqual([{ id: "q1", label: "New" }]);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("delete DELETEs and removes the question from the cached list", async () => {
    stubApi({ [`DELETE ${base}/questions/q1`]: noContent });
    const view = renderApiHook(() => useDeleteQuestion(BIZ), {
      seed: true,
      seedData: { questions: [{ id: "q1" }, { id: "q2" }] },
    });

    await act(() => view.result.current.mutateAsync("q1"));

    expect(view.data("questions")).toEqual([{ id: "q2" }]);
    expect(view.invalidated()).toEqual(refreshed);
  });
});
