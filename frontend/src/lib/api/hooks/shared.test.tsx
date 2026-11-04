/** The mutation contract every hook builds on (README §5): cache effects first, awaited, then the caller's onSuccess. */
import { useQueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qk } from "../query-keys";
import { enabledWhen, invalidateAll, removeFromList, replaceInList, useApiMutation } from "./shared";
import { useMe } from "./use-me";
import { useUpdateBusiness } from "./use-business";
import { BIZ, held, json, renderApiHook, sequence, stubApi } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

describe("useApiMutation", () => {
  it("stays pending until the invalidated active queries have refetched", async () => {
    const refetch = held(json({ user: { id: "u1" }, memberships: [] }));
    stubApi({
      "GET /v1/me": sequence(json({ user: { id: "u0" }, memberships: [] }), refetch.reply),
      "PATCH /v1/businesses/b1": json({ id: BIZ, name: "Renamed" }),
    });
    const { result, queryClient } = renderApiHook(() => ({ me: useMe(), update: useUpdateBusiness(BIZ) }));
    await waitFor(() => expect(result.current.me.data?.user.id).toBe("u0"));

    let settled = false;
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.update.mutateAsync({ name: "Renamed" }).then(() => {
        settled = true;
        // What the caller sees the moment mutateAsync resolves.
        return queryClient.getQueryData(qk.me());
      });
    });
    await waitFor(() => expect(result.current.me.isFetching).toBe(true));
    expect(result.current.update.isPending).toBe(true);
    expect(settled).toBe(false);

    refetch.release();
    await expect(act(() => done)).resolves.toEqual({ user: { id: "u1" }, memberships: [] });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
  });

  it("runs the caller's onSuccess after its own cache effects", async () => {
    stubApi({ "POST /v1/things": json({ id: "t1" }) });
    const order: string[] = [];
    const { result } = renderApiHook(() =>
      useApiMutation(
        () => fetch("/api/v1/things", { method: "POST" }).then((r) => r.json() as Promise<{ id: string }>),
        async () => {
          await Promise.resolve();
          order.push("cache");
        },
        { onSuccess: (data) => void order.push(`caller:${data.id}`) },
      ),
    );

    await act(() => result.current.mutateAsync(undefined));

    expect(order).toEqual(["cache", "caller:t1"]);
  });

  it("works without cache effects or caller options", async () => {
    const { result } = renderApiHook(() => useApiMutation(async (n: number) => n * 2));
    await expect(act(() => result.current.mutateAsync(21))).resolves.toBe(42);
  });
});

describe("cache helpers", () => {
  function client() {
    return renderApiHook(() => useQueryClient()).queryClient;
  }

  it("replaceInList swaps the entity by id and leaves an uncached list uncached", () => {
    const qc = client();
    const key = qk.business(BIZ).services();
    qc.setQueryData(key, [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    replaceInList(qc, key, { id: "b", name: "B2" } as { id: string });
    expect(qc.getQueryData(key)).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B2" },
    ]);

    replaceInList(qc, qk.business(BIZ).team(), { id: "x" });
    expect(qc.getQueryData(qk.business(BIZ).team())).toBeUndefined();
  });

  it("removeFromList drops the entity by id and leaves an uncached list uncached", () => {
    const qc = client();
    const key = qk.business(BIZ).questions();
    qc.setQueryData(key, [{ id: "a" }, { id: "b" }]);
    removeFromList(qc, key, "a");
    expect(qc.getQueryData(key)).toEqual([{ id: "b" }]);

    removeFromList(qc, qk.business(BIZ).team(), "x");
    expect(qc.getQueryData(qk.business(BIZ).team())).toBeUndefined();
  });

  it("invalidateAll invalidates every key (as prefixes)", async () => {
    const qc = client();
    qc.setQueryData(qk.business(BIZ).resourceAvailability("r1"), {});
    qc.setQueryData(qk.me(), {});
    qc.setQueryData(qk.myBookings(), {});
    await invalidateAll(qc, [qk.business(BIZ).resources(), qk.me()]);
    expect(qc.getQueryState(qk.business(BIZ).resourceAvailability("r1"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.me())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.myBookings())?.isInvalidated).toBe(false);
  });

  it("enabledWhen: false until ready, then the caller's flag (default true)", () => {
    expect(enabledWhen(false, { enabled: true })).toBe(false);
    expect(enabledWhen(true)).toBe(true);
    expect(enabledWhen(true, {})).toBe(true);
    expect(enabledWhen(true, { enabled: false })).toBe(false);
  });
});
