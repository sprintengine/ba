"use client";

import { createContext, useContext } from "react";
import type { PublicService, SiteContext, SitePlan } from "@/lib/api/types";
import { siteTheme, type SiteThemeDef } from "@/lib/site/themes";

/** The business fields a site needs (a `PublicBusiness` satisfies it). */
export type SiteBusiness = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  timezone: string;
  currency: string;
  locale: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; postcode: string | null };
  branding: { primaryColor: string; logoUrl: string | null; coverImageUrl: string | null };
  vocabulary: {
    booking: string;
    bookings: string;
    resource: string;
    resources: string;
    customer: string;
    customers: string;
  };
  showBadge: boolean;
};

export type SiteRenderMode = "public" | "preview" | "thumbnail";

export type SiteRenderValue = {
  plan: SitePlan;
  theme: SiteThemeDef;
  business: SiteBusiness;
  services: PublicService[];
  context: SiteContext;
  mode: SiteRenderMode;
  /** `/slug/book`, optionally for one service. */
  bookHref: (serviceId?: string) => string;
};

const Ctx = createContext<SiteRenderValue | null>(null);

export function SiteRenderProvider({
  value,
  children,
}: {
  value: Omit<SiteRenderValue, "theme">;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={{ ...value, theme: siteTheme(value.plan.theme) }}>{children}</Ctx.Provider>;
}

export function useSiteRender(): SiteRenderValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteRender must be used inside <SiteRenderProvider>");
  return v;
}

export function bookHrefFor(slug: string) {
  return (serviceId?: string) =>
    serviceId ? `/${slug}/book?service=${encodeURIComponent(serviceId)}` : `/${slug}/book`;
}
