/**
 * Connecting an AI app to bookanything's MCP servers (architecture §20), as data (pure).
 *
 * - **Claude** documents an install link that opens its "Add custom connector" dialog with the name and URL filled in;
 *   the person reviews and confirms there (https://claude.com/docs/connectors/building/directory-vs-custom, "Custom
 *   connector install link"). It's an https link on claude.ai, so it opens the Claude app where the app handles it,
 *   else the browser.
 * - **ChatGPT** documents no link that fills in a connector; its guide starts at the Plugins page
 *   (https://developers.openai.com/apps-sdk/deploy/connect-chatgpt). We copy the server URL and open that page.
 */

export type McpServer = "customer" | "business";

export const MCP_PATHS: Record<McpServer, string> = { customer: "/mcp", business: "/mcp/business" };

/** The website help page each server's steps mirror. */
export const HELP_PATHS: Record<McpServer, string> = {
  customer: "/help/ai-assistant",
  business: "/help/ai-agents-for-business",
};

export const CHATGPT_PLUGINS_URL = "https://chatgpt.com/plugins";
export const CLAUDE_DOCS_URL = "https://claude.com/docs/connectors/custom/add-unlisted";
export const OPENAI_DOCS_URL = "https://developers.openai.com/apps-sdk/deploy/connect-chatgpt";

/** The connector's name in the AI app. */
export function connectorName(server: McpServer): string {
  return server === "business" ? "bookanything for business" : "bookanything";
}

export function parseServer(value: string | string[] | undefined): McpServer {
  return value === "business" ? "business" : "customer";
}

/** The server URL people paste: the website origin plus the server's path. */
export function mcpServerUrl(webUrl: string, server: McpServer): string {
  return `${webUrl.replace(/\/+$/, "")}${MCP_PATHS[server]}`;
}

/** Claude's documented install link: its "Add custom connector" dialog, prefilled, for the person to confirm. */
export function claudeConnectorLink(name: string, serverUrl: string): string {
  const query = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: name,
    connectorUrl: serverUrl,
  });
  return `https://claude.ai/customize/connectors?${query.toString()}`;
}

/** AI apps reach the server from the internet: a local http address (development) won't work from them. */
export function reachableByAiApps(serverUrl: string): boolean {
  try {
    const url = new URL(serverUrl);
    return (
      url.protocol === "https:" &&
      !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
