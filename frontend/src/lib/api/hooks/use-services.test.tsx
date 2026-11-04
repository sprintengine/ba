/** Services: requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceInput } from "../types";
import { useCreateService, useDeleteService, useReplaceService, useServices } from "./use-services";
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

const customers = keyNames("customersList", "customersInfinite", "customerDetail");
const base = `/v1/businesses/${BIZ}`;
// Services set slots and prices: staff and public availability, the checklist, public pages and listings.
const refreshed = keyNames("overview", "services", "staffAvailability", ...PUBLIC, ...MARKETPLACE);
const input = { name: "Massage", durationMinutes: 60 } as unknown as ServiceInput;

describe("services", () => {
  it("useServices GETs the services, once there is a business", async () => {
    const api = stubApi({ [`GET ${base}/services`]: json([{ id: "s1" }]) });
    const { result } = renderApiHook(() => ({ services: useServices(BIZ), none: useServices("") }));
    await waitFor(() => expect(result.current.services.data).toEqual([{ id: "s1" }]));
    expect(result.current.none.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(1);
  });

  it("create POSTs and refreshes everything priced by services", async () => {
    const api = stubApi({ [`POST ${base}/services`]: json({ id: "s9" }) });
    const view = renderApiHook(() => useCreateService(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(input));

    expect(api.last().body).toEqual(input);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("replace PUTs the full service and swaps it in the cached list", async () => {
    const api = stubApi({ [`PUT ${base}/services/s1`]: json({ id: "s1", name: "Massage" }) });
    const view = renderApiHook(() => useReplaceService(BIZ), {
      seed: true,
      seedData: { services: [{ id: "s1", name: "Old" }] },
    });

    await act(() => view.result.current.mutateAsync({ id: "s1", input }));

    expect(api.last()).toMatchObject({ method: "PUT", body: input });
    expect(view.data("services")).toEqual([{ id: "s1", name: "Massage" }]);
    // Bookings (the calendar, lists, customer histories) embed the service's name and colour.
    expect(view.invalidated()).toEqual(
      keyNames(...refreshed, "bookingsList", "bookingsInfinite", "bookingDetail", ...customers),
    );
  });

  it("delete DELETEs and refreshes everything priced by services", async () => {
    stubApi({ [`DELETE ${base}/services/s1`]: noContent });
    const view = renderApiHook(() => useDeleteService(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("s1"));

    expect(view.invalidated()).toEqual(refreshed);
  });
});
