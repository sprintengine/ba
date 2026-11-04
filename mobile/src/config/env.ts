/**
 * Runtime configuration, from app.config.ts `extra` (docs/mobile.md "Environments"). Read it through `env`, never
 * `process.env` or `Constants` in features.
 */
import Constants from "expo-constants";

export type AppVariant = "development" | "preview" | "production";

export type AppEnv = {
  variant: AppVariant;
  /** API origin (`https://api.bookanything.ie`); the client appends `/v1/...`. */
  apiUrl: string;
  /** Website origin, for pages the app opens in the browser and for the MCP server URLs. */
  webUrl: string;
  /** Clerk in production and preview; dev bearer tokens against a dev backend otherwise (architecture §3.2). */
  authMode: "clerk" | "dev";
  clerkPublishableKey: string | null;
};

type Extra = Partial<{ variant: string; apiUrl: string; webUrl: string; clerkPublishableKey: string }>;

/** Default ports of the local backend (`npm run backend:dev`) and website (`npm run frontend:dev`). */
const DEV_API_PORT = 8080;
const DEV_WEB_PORT = 3000;

/** The Mac's address as the device sees it: the host of the Metro server it loaded the bundle from. */
export function devHostFrom(hostUri: string | null | undefined): string {
  const host = hostUri?.split(":")[0]?.trim();
  return host || "localhost";
}

/**
 * Resolve the environment from `extra` and, in development, the Metro host: a physical phone on the same Wi-Fi
 * reaches the Mac's backend at http://<LAN IP>:8080 with no configuration. `EXPO_PUBLIC_API_PORT` changes the port.
 */
export function resolveEnv(extra: Extra, hostUri: string | null | undefined, apiPort?: string): AppEnv {
  const variant: AppVariant =
    extra.variant === "preview" || extra.variant === "production" ? extra.variant : "development";
  const host = devHostFrom(hostUri);
  const apiUrl =
    extra.apiUrl || (variant === "development" ? `http://${host}:${apiPort || DEV_API_PORT}` : "");
  const webUrl = extra.webUrl || (variant === "development" ? `http://${host}:${DEV_WEB_PORT}` : "");
  const clerkPublishableKey = extra.clerkPublishableKey || null;
  return {
    variant,
    apiUrl: apiUrl.replace(/\/+$/, ""),
    webUrl: webUrl.replace(/\/+$/, ""),
    authMode: clerkPublishableKey ? "clerk" : "dev",
    clerkPublishableKey,
  };
}

export const env: AppEnv = resolveEnv(
  (Constants.expoConfig?.extra ?? {}) as Extra,
  Constants.expoConfig?.hostUri,
  process.env.EXPO_PUBLIC_API_PORT,
);

/** Whether the build is misconfigured (a store build without Clerk or an API): shown instead of the app. */
export function configProblem(e: AppEnv = env): string | null {
  if (e.variant === "development") return null;
  if (!e.apiUrl) return "This build has no API address (EXPO_PUBLIC_API_URL).";
  if (e.authMode !== "clerk")
    return "This build has no sign-in configured (EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY).";
  return null;
}
