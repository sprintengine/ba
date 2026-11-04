/**
 * Whether the public pages (the landing page, its demo, the help pages) present Bo: only when
 * `NEXT_PUBLIC_ASSISTANT_ENABLED` is `true`, read at build time and set with the backend's `ASSISTANT_ENABLED` (both off
 * by default). Off, they tell owners to connect their own AI assistant to the business MCP instead. The dashboard and
 * the app don't read this: they follow each business's `assistantAvailable`.
 */
export function assistantMarketed(): boolean {
  return process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "true";
}
