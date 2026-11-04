/**
 * Test-only: the browser's side of WebMCP. Installs a `document.modelContext` that keeps the tools a page registers
 * (until their signal aborts) and calls them as an agent would. Every result is checked, as JSON, against the tool's
 * `outputSchema`, so a schema can't drift from what the tool returns.
 */
import { act } from "@testing-library/react";
import Ajv from "ajv";
import type { ModelContextTool } from "@/lib/webmcp/model-context";

// Strict, so a keyword ajv doesn't know fails; `required` may name properties of the parent (`toolOutput`'s anyOf).
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });

export function fakeModelContext() {
  const tools = new Map<string, { tool: ModelContextTool; signal?: AbortSignal }>();
  Object.assign(document, {
    modelContext: {
      registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
        tools.set(tool.name, { tool, signal: options?.signal });
        options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
        return Promise.resolve();
      },
    },
  });
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const entry = tools.get(name);
    if (!entry) throw new Error(`No tool ${name}`);
    let result: unknown;
    await act(async () => {
      result = await entry.tool.execute(input, { signal: new AbortController().signal });
    });
    const json = JSON.parse(JSON.stringify(result ?? null)) as unknown;
    assertMatchesOutputSchema(entry.tool, json);
    return json as Record<string, unknown>;
  };
  return { tools, call };
}

/** Throws when `result` (as JSON) doesn't match `tool.outputSchema`; every tool must declare one. */
export function assertMatchesOutputSchema(tool: ModelContextTool, result: unknown) {
  if (!tool.outputSchema) throw new Error(`${tool.name} has no outputSchema`);
  const validate = ajv.compile(tool.outputSchema);
  if (!validate(result))
    throw new Error(
      `${tool.name}'s result doesn't match its outputSchema: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(result)}`,
    );
}

export function removeModelContext() {
  delete (document as { modelContext?: unknown }).modelContext;
}
