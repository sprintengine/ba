/** Resources, weekly hours, overrides and closures: requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityOverrideInput, AvailabilityRuleInput, ResourceInput } from "../types";
import {
  useClosures,
  useCreateClosure,
  useCreateResource,
  useCreateResourceOverride,
  useDeleteOverride,
  useDeleteResource,
  useReplaceResourceRules,
  useResourceAvailabilities,
  useResourceAvailability,
  useResources,
  useUpdateResource,
} from "./use-resources";
import {
  BIZ,
  MARKETPLACE,
  PUBLIC,
  json,
  keyNames,
  noContent,
  renderApiHook,
  stubApi,
} from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;
/** Every change to resources or hours: slots, the setup checklist, public pages and marketplace next free times. */
const customers = keyNames("customersList", "customersInfinite", "customerDetail");
const schedule = keyNames(
  "overview",
  "resources",
  "resourceAvailability",
  "closures",
  "staffAvailability",
  ...PUBLIC,
  ...MARKETPLACE,
);

const resourceInput: ResourceInput = {
  kind: "person",
  name: "Aoife",
  description: null,
  color: "#0f766e",
  capacity: 1,
  memberId: "m1",
  isActive: true,
  sortOrder: 1,
};

const override: AvailabilityOverrideInput = {
  date: "2026-12-25",
  isAvailable: false,
  startTime: null,
  endTime: null,
  reason: "Christmas",
};

describe("resource queries", () => {
  it("useResources and useClosures GET their lists", async () => {
    stubApi({
      [`GET ${base}/resources`]: json([{ id: "r1" }]),
      [`GET ${base}/closures`]: json([{ id: "o1" }]),
    });
    const { result } = renderApiHook(() => ({ resources: useResources(BIZ), closures: useClosures(BIZ) }));
    await waitFor(() => expect(result.current.resources.data).toEqual([{ id: "r1" }]));
    await waitFor(() => expect(result.current.closures.data).toEqual([{ id: "o1" }]));
  });

  it("useResourceAvailability GETs one resource's rules and overrides", async () => {
    const api = stubApi({ [`GET ${base}/resources/r%201/availability`]: json({ rules: [], overrides: [] }) });
    const { result } = renderApiHook(() => useResourceAvailability(BIZ, "r 1"));
    await waitFor(() => expect(result.current.data).toEqual({ rules: [], overrides: [] }));
    expect(api.calls).toHaveLength(1);
  });

  it("useResourceAvailability waits for both ids", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => ({
      noBusiness: useResourceAvailability("", "r1"),
      noResource: useResourceAvailability(BIZ, ""),
    }));
    expect(result.current.noBusiness.fetchStatus).toBe("idle");
    expect(result.current.noResource.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("useResourceAvailabilities loads one entry per resource, in order, shared with useResourceAvailability", async () => {
    stubApi({
      [`GET ${base}/resources/r1/availability`]: json({ rules: [{ id: "a" }], overrides: [] }),
      [`GET ${base}/resources/r2/availability`]: json({ rules: [{ id: "b" }], overrides: [] }),
    });
    const { result, queryClient } = renderApiHook(() => useResourceAvailabilities(BIZ, ["r1", "r2"]));

    await waitFor(() => expect(result.current.every((r) => r.isSuccess)).toBe(true));

    expect(result.current.map((r) => r.data?.rules[0]?.id)).toEqual(["a", "b"]);
    expect(queryClient.getQueryData(["business", BIZ, "resources", "r2", "availability"])).toEqual({
      rules: [{ id: "b" }],
      overrides: [],
    });
  });

  it("useResourceAvailabilities skips empty ids", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => useResourceAvailabilities(BIZ, [""]));
    expect(result.current[0]?.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });
});

describe("resource mutations", () => {
  it("create POSTs and refreshes the schedule and the team (the new resource may link a member)", async () => {
    const api = stubApi({ [`POST ${base}/resources`]: json({ id: "r9", ...resourceInput }) });
    const view = renderApiHook(() => useCreateResource(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(resourceInput));

    expect(api.last().body).toEqual(resourceInput);
    expect(view.invalidated()).toEqual(keyNames(...schedule, "team"));
  });

  it("update PATCHes, swaps the resource in the list and refreshes the schedule and team", async () => {
    const api = stubApi({ [`PATCH ${base}/resources/r1`]: json({ id: "r1", name: "Aoife M" }) });
    const view = renderApiHook(() => useUpdateResource(BIZ), {
      seed: true,
      seedData: { resources: [{ id: "r1", name: "Aoife" }] },
    });

    await act(() => view.result.current.mutateAsync({ id: "r1", input: { name: "Aoife M" } }));

    expect(api.last().body).toEqual({ name: "Aoife M" });
    expect(view.data("resources")).toEqual([{ id: "r1", name: "Aoife M" }]);
    // Bookings (the calendar, lists, customer histories) embed the resource's name.
    expect(view.invalidated()).toEqual(
      keyNames(...schedule, "team", "bookingsList", "bookingsInfinite", "bookingDetail", ...customers),
    );
  });

  it("delete DELETEs and refreshes the schedule and team", async () => {
    stubApi({ [`DELETE ${base}/resources/r1`]: noContent });
    const view = renderApiHook(() => useDeleteResource(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("r1"));

    expect(view.invalidated()).toEqual(keyNames(...schedule, "team"));
  });

  it("replacing weekly rules PUTs { rules } and refreshes the schedule", async () => {
    const rules: AvailabilityRuleInput[] = [
      {
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        validFrom: null,
        validUntil: null,
        audienceGroupIds: [],
      },
    ];
    const api = stubApi({ [`PUT ${base}/resources/r1/rules`]: json({ rules }) });
    const view = renderApiHook(() => useReplaceResourceRules(BIZ, "r1"), { seed: true });

    await act(() => view.result.current.mutateAsync(rules));

    expect(api.last().body).toEqual({ rules });
    expect(view.invalidated()).toEqual(schedule);
  });

  it("a resource override POSTs under the resource and refreshes the schedule", async () => {
    const api = stubApi({ [`POST ${base}/resources/r1/overrides`]: json({ id: "o2", ...override }) });
    const view = renderApiHook(() => useCreateResourceOverride(BIZ, "r1"), { seed: true });

    await act(() => view.result.current.mutateAsync(override));

    expect(api.last().body).toEqual(override);
    expect(view.invalidated()).toEqual(schedule);
  });

  it("a closure POSTs business-wide and refreshes the schedule", async () => {
    const api = stubApi({ [`POST ${base}/closures`]: json({ id: "o3", resourceId: null, ...override }) });
    const view = renderApiHook(() => useCreateClosure(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(override));

    expect(api.last().body).toEqual(override);
    expect(view.invalidated()).toEqual(schedule);
  });

  it("deleting an override uses the business-level path and drops it from the closures", async () => {
    stubApi({ [`DELETE ${base}/overrides/o1`]: noContent });
    const view = renderApiHook(() => useDeleteOverride(BIZ), {
      seed: true,
      seedData: { closures: [{ id: "o1" }, { id: "o2" }] },
    });

    await act(() => view.result.current.mutateAsync("o1"));

    expect(view.data("closures")).toEqual([{ id: "o2" }]);
    expect(view.invalidated()).toEqual(schedule);
  });
});
