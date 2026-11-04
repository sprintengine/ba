import { afterEach, describe, expect, it, vi } from "vitest";
import { modelContext, registerTools, type ModelContextTool } from "./model-context";

const tool = (
  name: string,
  execute: ModelContextTool["execute"] = () => ({ ok: true }),
): ModelContextTool => ({
  name,
  description: name,
  inputSchema: { type: "object", properties: {} },
  execute,
});

afterEach(() => {
  delete (document as { modelContext?: unknown }).modelContext;
  delete (navigator as { modelContext?: unknown }).modelContext;
});

describe("modelContext", () => {
  it("is null without WebMCP, document.modelContext with it, navigator.modelContext on older Chrome", () => {
    expect(modelContext()).toBeNull();
    const legacy = { registerTool: vi.fn() };
    Object.assign(navigator, { modelContext: legacy });
    expect(modelContext()).toBe(legacy);
    const current = { registerTool: vi.fn() };
    Object.assign(document, { modelContext: current });
    expect(modelContext()).toBe(current);
  });
});

describe("registerTools", () => {
  it("registers each tool with the signal; a refused one doesn't stop the others", async () => {
    const registered: { tool: ModelContextTool; signal?: AbortSignal }[] = [];
    const context = {
      registerTool: vi.fn((t: ModelContextTool, options?: { signal?: AbortSignal }) => {
        if (t.name === "bad") throw new TypeError("Invalid schema");
        registered.push({ tool: t, signal: options?.signal });
        return Promise.resolve();
      }),
    };
    const controller = new AbortController();
    registerTools(context, [tool("bad"), tool("good")], controller.signal);
    expect(registered.map((r) => r.tool.name)).toEqual(["good"]);
    expect(registered[0]?.signal).toBe(controller.signal);
    await expect(registered[0]?.tool.execute({}, { signal: controller.signal })).resolves.toEqual({
      ok: true,
    });
  });

  it("returns a thrown error as { error } and gives a missing input as {}", async () => {
    let execute: ModelContextTool["execute"] = () => null;
    const seen: unknown[] = [];
    registerTools(
      { registerTool: (t) => void (execute = t.execute) },
      [
        tool("t", (input) => {
          seen.push(input);
          throw new Error("No such service");
        }),
      ],
      new AbortController().signal,
    );
    const signal = new AbortController().signal;
    await expect(execute(undefined as unknown as Record<string, unknown>, { signal })).resolves.toEqual({
      error: "No such service",
    });
    expect(seen).toEqual([{}]);
  });

  it("unregisters by name on abort where the browser has unregisterTool", () => {
    const unregisterTool = vi.fn((name: string) => {
      if (name === "b") throw new Error("Not registered");
    });
    const controller = new AbortController();
    registerTools(
      { registerTool: vi.fn(), unregisterTool },
      [tool("a"), tool("b"), tool("c")],
      controller.signal,
    );
    expect(unregisterTool).not.toHaveBeenCalled();
    controller.abort();
    expect(unregisterTool.mock.calls.map(([n]) => n)).toEqual(["a", "b", "c"]);
  });
});
