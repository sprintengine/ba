/**
 * WebMCP (https://webmachinelearning.github.io/webmcp/): a page registers tools that an AI agent in the browser
 * calls with structured input, instead of reading the page and clicking through it. The agent works in the
 * visitor's own tab, with their session, while they watch.
 *
 * Chrome and Edge ship it as origin trials (see `WEBMCP_ORIGIN_TRIAL_TOKEN` and `WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN` in
 * next.config.ts) on `document.modelContext`; Chrome before 150 had it on `navigator.modelContext`. Typed here, only as far as we use it, rather than with a
 * package for a draft that still moves.
 */

/** The JSON Schema of a tool's input: always an object. */
export type ToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * The JSON Schema of what a tool returns. Ours describe both outcomes (`toolOutput`): the result, and `{ error }`,
 * since a failure is returned rather than thrown (`registerTools`).
 */
export type ToolOutputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: readonly string[];
  anyOf?: readonly { required: readonly string[] }[];
};

/**
 * An output schema for a tool returning an object with `properties`, of which `required` are always there, or else
 * `{ error }` (with optional details among `properties`): a result missing a required key, or a renamed one, fails it.
 */
export function toolOutput(
  properties: Record<string, unknown>,
  required: readonly string[],
): ToolOutputSchema {
  return {
    type: "object",
    properties: { ...properties, error: { type: "string" } },
    anyOf: [{ required }, { required: ["error"] }],
  };
}

/** Hints for the agent and the browser; all default to false. */
export type ToolAnnotations = {
  /** The tool changes nothing. */
  readOnlyHint?: boolean;
  /** The result holds text the page didn't write (here: what a business wrote), to be treated as data. */
  untrustedContentHint?: boolean;
  /** Significant or irreversible: browsers may ask the user before running it. */
  consequentialHint?: boolean;
};

export type ModelContextTool = {
  /** snake_case, unique on the page. */
  name: string;
  title?: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema;
  annotations?: ToolAnnotations;
  /** The input is the agent's, unchecked. The result (or what it resolves to) is sent to the agent as JSON. */
  execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => unknown;
};

type ModelContext = {
  /** Unregisters the tool when `signal` aborts (rejecting with an AbortError). */
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void> | void;
  /** `navigator.modelContext` (Chrome before 150) unregistered by name instead. */
  unregisterTool?: (name: string) => void;
};

/** The browser's model context, or null without WebMCP (every browser outside the origin trial). */
export function modelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  const fromDocument = (document as Document & { modelContext?: ModelContext }).modelContext;
  const fromNavigator = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  return fromDocument ?? fromNavigator ?? null;
}

/**
 * Registers `tools` until `signal` aborts. A tool the browser refuses doesn't stop the others. A tool's thrown
 * error reaches the agent only as "tool rejected", so a failure is returned as `{ error }` instead.
 */
export function registerTools(context: ModelContext, tools: ModelContextTool[], signal: AbortSignal) {
  for (const tool of tools) {
    const execute: ModelContextTool["execute"] = async (input: unknown, options) => {
      try {
        const args = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        return await tool.execute(args, options);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
      }
    };
    try {
      void Promise.resolve(context.registerTool({ ...tool, execute }, { signal })).catch(() => {});
    } catch {
      // Refused (a duplicate name, a schema it can't read): carry on with the others.
    }
  }
  const { unregisterTool } = context;
  if (!unregisterTool) return;
  signal.addEventListener(
    "abort",
    () => {
      for (const tool of tools) {
        try {
          unregisterTool.call(context, tool.name);
        } catch {
          // Already gone: the signal unregistered it.
        }
      }
    },
    { once: true },
  );
}
