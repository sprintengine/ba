/** Customer help: connecting an AI assistant. */
export const AI_HELP_PATH = "/help/ai-assistant";
/** The account page listing connected apps. */
export const CONNECTED_APPS_PATH = "/my/connected-apps";
/** Business members' help: running their business from their own AI agent. */
export const BUSINESS_AI_HELP_PATH = "/help/ai-agents-for-business";
/** Where customers point their AI assistant (the signed-in MCP server). */
export const MCP_PATH = "/mcp";
/** Where business members point their AI agent (the business MCP server). */
export const BUSINESS_MCP_PATH = "/mcp/business";

/**
 * Whether the business MCP is live: on unless `NEXT_PUBLIC_BUSINESS_MCP_ENABLED` is `false` (set with the backend's
 * `BUSINESS_MCP_ENABLED` kill switch). While off, its guide isn't indexed, listed in the sitemap or linked from the
 * customer guide.
 */
export function businessAgentsLive(): boolean {
  return process.env.NEXT_PUBLIC_BUSINESS_MCP_ENABLED !== "false";
}
/** Read-only MCP server without sign-in (search and availability), for developers. */
export const PUBLIC_MCP_PATH = "/api/v1/mcp";
/** OAuth authorization server metadata (RFC 8414). */
export const OAUTH_METADATA_PATH = "/.well-known/oauth-authorization-server";

const DEV_ORIGIN = "http://localhost:3000";

/** The configured public origin (`NEXT_PUBLIC_APP_URL`, no trailing slash), or null when unset. */
export function configuredOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return value ? value : null;
}

/**
 * The public host, for showing addresses ("bookanything.ie/gleam"): the configured origin's, else bookanything.ie.
 * The same on the server and the client.
 */
export function publicHost(): string {
  return urlHost(configuredOrigin()) ?? "bookanything.ie";
}

/** Public origin: the configured one, else the browser's (client) or localhost (server). */
export function appOrigin(): string {
  return configuredOrigin() ?? (typeof window !== "undefined" ? window.location.origin : DEV_ORIGIN);
}

/** Server-side fallback (same on the server and during hydration). */
export function serverAppOrigin(): string {
  return configuredOrigin() ?? DEV_ORIGIN;
}

/** Absolute URL on the app origin: `appUrl("/mcp")` → `https://bookanything.ie/mcp`. */
export function appUrl(path: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Host of a URL for display ("claude.ai"), or null when it isn't a valid absolute URL. */
export function urlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}
