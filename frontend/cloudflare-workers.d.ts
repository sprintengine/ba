/**
 * The one part of the Workers runtime API that `worker.ts` uses: the Worker's bindings (vars and secrets) at module
 * scope. The full types (`@cloudflare/workers-types`) are not installed for this alone.
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
