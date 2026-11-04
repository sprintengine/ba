"use client";

import { createContext, useContext, useMemo } from "react";
import type { Business, Me, MemberRole } from "@/lib/api/types";
import { hasRole, permissionsFor, type DashboardPermissions } from "./permissions";

export type BusinessContextValue = {
  business: Business;
  role: MemberRole;
  me: Me;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

/**
 * Provides the context from `value`'s parts, so a caller passing a fresh object literal each render
 * (`value={{ business, role, me }}`) does not re-render every consumer: the value only changes when
 * the business, role or `Me` does.
 */
export function BusinessContextProvider({
  value: { business, role, me },
  children,
}: {
  value: BusinessContextValue;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ business, role, me }), [business, role, me]);
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

/**
 * The current dashboard business (`/dashboard/[slug]/…`), the caller's role
 * and `Me`. Provided by the dashboard layout — every dashboard page can rely on it.
 */
export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusinessContext must be used inside /dashboard/[slug]");
  return ctx;
}

/** The business context where there is one (a header shared by business and other screens), else null. */
export function useOptionalBusinessContext(): BusinessContextValue | null {
  return useContext(BusinessContext);
}

/** Shorthand for `useBusinessContext().business`. */
export function useCurrentBusiness(): Business {
  return useBusinessContext().business;
}

/**
 * What the current member may do (`permissionsFor` their role), plus `can(minRole)` for role-ranked lists. The UI
 * hides or explains actions with these; the backend decides.
 */
export function usePermissions(): DashboardPermissions & { can: (required: MemberRole) => boolean } {
  const { role, business } = useBusinessContext();
  const sitesEnabled = !!business.sitesEnabled;
  return useMemo(
    () => ({
      ...permissionsFor(role, { sitesEnabled }),
      can: (required: MemberRole) => hasRole(role, required),
    }),
    [role, sitesEnabled],
  );
}
