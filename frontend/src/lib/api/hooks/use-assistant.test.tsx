/** Bo (§17): state, threads, proposals, nudges and memory. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useAddMemory,
  useAssistantMemory,
  useAssistantState,
  useAssistantThread,
  useConfirmAction,
  useCreateThread,
  useDeleteMemory,
  useDismissNudge,
  useUpdateMemory,
} from "./use-assistant";
import {
  BIZ,
  BUSINESS,
  MARKETPLACE,
  PUBLIC,
  held,
  json,
  keyNames,
  noContent,
  renderApiHook,
  stubApi,
} from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;

describe("assistant", () => {
  it("state, a thread and memory GET under /assistant", async () => {
    stubApi({
      [`GET ${base}/assistant`]: json({ nudges: [] }),
      [`GET ${base}/assistant/threads/t1`]: json({ id: "t1", messages: [] }),
      [`GET ${base}/assistant/memory`]: json([{ id: "m1" }]),
    });
    const { result } = renderApiHook(() => ({
      state: useAssistantState(BIZ),
      thread: useAssistantThread(BIZ, "t1"),
      memory: useAssistantMemory(BIZ),
    }));
    await waitFor(() => expect(result.current.state.data).toEqual({ nudges: [] }));
    await waitFor(() => expect(result.current.thread.data).toEqual({ id: "t1", messages: [] }));
    await waitFor(() => expect(result.current.memory.data).toEqual([{ id: "m1" }]));
  });

  it("no thread is loaded until there is one", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => useAssistantThread(BIZ, null));
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("creating a thread caches it for the panel", async () => {
    stubApi({ [`POST ${base}/assistant/threads`]: json({ id: "t9", messages: [] }) });
    const view = renderApiHook(() => useCreateThread(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync());

    expect(view.queryClient.getQueryData(["business", BIZ, "assistant", "thread", "t9"])).toEqual({
      id: "t9",
      messages: [],
    });
    expect(view.invalidated()).toEqual([]);
  });

  it("confirming a proposal refreshes the whole business, its public pages and listings, and nothing of others", async () => {
    stubApi({ [`POST ${base}/assistant/actions/a1/confirm`]: json({ id: "a1", status: "done" }) });
    const view = renderApiHook(() => useConfirmAction(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("a1"));

    // Bo's actions change services, hours and bookings, which public pages and marketplace listings show.
    expect(view.invalidated()).toEqual(keyNames(...BUSINESS, ...PUBLIC, ...MARKETPLACE));
  });

  it("confirming resolves without waiting for the business's queries to refetch", async () => {
    const state = held(json({ nudges: [] }));
    stubApi({
      [`GET ${base}/assistant`]: state.reply,
      [`POST ${base}/assistant/actions/a1/confirm`]: json({ id: "a1", status: "confirmed" }),
    });
    const view = renderApiHook(() => ({ state: useAssistantState(BIZ), confirm: useConfirmAction(BIZ) }));

    // The state query is mid-fetch (held): a confirm that awaited the refresh would never resolve.
    await act(async () => {
      await expect(view.result.current.confirm.mutateAsync("a1")).resolves.toEqual({
        id: "a1",
        status: "confirmed",
      });
    });
    state.release();
  });

  it("dismissing a nudge drops it from the cached state", async () => {
    stubApi({ [`POST ${base}/assistant/nudges/n1/dismiss`]: noContent });
    const view = renderApiHook(() => useDismissNudge(BIZ), {
      seed: true,
      seedData: { assistant: { configured: true, nudges: [{ id: "n1" }, { id: "n2" }] } },
    });

    await act(() => view.result.current.mutateAsync("n1"));

    expect(view.data("assistant")).toEqual({ configured: true, nudges: [{ id: "n2" }] });
  });

  it("dismissing a nudge without a cached state leaves it uncached", async () => {
    stubApi({ [`POST ${base}/assistant/nudges/n1/dismiss`]: noContent });
    const view = renderApiHook(() => useDismissNudge(BIZ));
    await act(() => view.result.current.mutateAsync("n1"));
    expect(view.data("assistant")).toBeUndefined();
  });

  it("memory add, update and delete refresh only the memory", async () => {
    const api = stubApi({
      [`POST ${base}/assistant/memory`]: json({ id: "m2", text: "Closed on bank holidays" }),
      [`PATCH ${base}/assistant/memory/m2`]: json({ id: "m2", text: "Open on bank holidays" }),
      [`DELETE ${base}/assistant/memory/m2`]: noContent,
    });
    const view = renderApiHook(
      () => ({ add: useAddMemory(BIZ), update: useUpdateMemory(BIZ), remove: useDeleteMemory(BIZ) }),
      { seed: true },
    );

    await act(() => view.result.current.add.mutateAsync("Closed on bank holidays"));
    expect(view.invalidated()).toEqual(["assistantMemory"]);
    await act(() => view.result.current.update.mutateAsync({ id: "m2", text: "Open on bank holidays" }));
    await act(() => view.result.current.remove.mutateAsync("m2"));

    expect(api.calls.map((c) => [c.method, c.body])).toEqual([
      ["POST", { text: "Closed on bank holidays" }],
      ["PATCH", { text: "Open on bank holidays" }],
      ["DELETE", undefined],
    ]);
    expect(view.invalidated()).toEqual(["assistantMemory"]);
  });
});
