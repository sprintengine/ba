/**
 * Auth (Clerk, ~70 KB gzip) and the query client are mounted by the route groups that use them, not the root layout
 * (app-providers.tsx). A page outside them that calls `useAuth()` or a query hook fails at runtime, so every top-level
 * route needs a decision here, the way the backend's access matrix needs one per route.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(import.meta.dirname, "..");
const source = (file: string) => readFileSync(path.join(APP, file), "utf8");

/** Layouts that mount `AppProviders` (auth + query). */
const WITH_APP_PROVIDERS = [
  "(auth)/layout.tsx",
  "[slug]/layout.tsx",
  "dashboard/layout.tsx",
  "dev/layout.tsx",
  "invitations/layout.tsx",
  "manage/layout.tsx",
  "my/layout.tsx",
  "oauth/authorize/layout.tsx",
  "onboarding/layout.tsx",
];

/** Top-level routes: where their providers come from. */
const TOP_LEVEL: Record<string, string> = {
  "(auth)": "AppProviders",
  "[slug]": "AppProviders",
  dashboard: "AppProviders",
  dev: "AppProviders",
  invitations: "AppProviders",
  manage: "AppProviders",
  my: "AppProviders",
  oauth: "AppProviders (authorize/layout.tsx)",
  onboarding: "AppProviders",
  "(marketing)": "none: the nav reads a signed-in hint; Explore mounts PublicQueryProvider",
  ".well-known": "none: route handlers only (the mobile app's link documents)",
};

describe("where the auth and query providers are mounted", () => {
  it("keeps them out of the root layout, so marketing pages don't load Clerk", () => {
    const root = source("providers.tsx") + source("layout.tsx");
    expect(root).not.toMatch(/from "[^"]*(auth-provider|query-provider|app-providers|@clerk)[^"]*"/);
    expect(root).toMatch(/from "@\/lib\/theme\/theme-provider"/);
  });

  it("mounts them in every route group that uses them", () => {
    for (const layout of WITH_APP_PROVIDERS) {
      expect(source(layout), layout).toMatch(/import \{ AppProviders \} from "@\/app\/app-providers"/);
      expect(source(layout), layout).toMatch(/<AppProviders>/);
    }
    expect(source("(marketing)/explore/layout.tsx")).toMatch(/<PublicQueryProvider>/);
  });

  it("has decided for every top-level route", () => {
    const routes = readdirSync(APP, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("__") && d.name !== "fonts")
      .map((d) => d.name)
      .sort();
    expect(routes).toEqual(Object.keys(TOP_LEVEL).sort());
  });

  it("keeps the marketing pages off the auth provider and the query hooks", () => {
    const marketingNav = readFileSync(path.join(APP, "../components/shells/marketing-nav.tsx"), "utf8");
    expect(marketingNav).not.toMatch(/lib\/auth\/context|@tanstack|lib\/api\/hooks/);
  });
});
