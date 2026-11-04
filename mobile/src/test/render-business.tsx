/**
 * Render a business screen (`/dashboard/[slug]/…`) the way the shell provides it: the website's business context
 * (`useBusinessContext`, `usePermissions`) and vocabulary, for a member with `role`, inside an in-memory router so
 * navigation and focus effects work. The route is `/dashboard/<slug>/<path>`; `routes` adds the screens it may
 * open (`{ "dashboard/[slug]/services/[id]": () => <ServiceScreen /> }`).
 *
 *   renderBusinessScreen(<TeamScreen />, { role: "admin", path: "team" });
 */
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement, ReactNode } from "react";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { Business, Me, MemberRole } from "@shared/api/types";
import { BusinessContextProvider } from "@shared/business/business-context";
import { VocabularyProvider } from "@shared/vocabulary";
import { Providers, testQueryClient, type ProviderOptions } from "./render";

export type BusinessScreenOptions = ProviderOptions & {
  role?: MemberRole;
  business?: Partial<Business>;
  me?: Me;
  /** The screen's path under the business ("team", "settings/general"). */
  path?: string;
  /** A query string the screen is opened with ("stripe=complete&code=…"), as from a link. */
  query?: string;
  routes?: Record<string, () => ReactElement>;
};

export function testBusiness(patch: Partial<Business> = {}): Business {
  return { ...businessFixture, slug: "lumen-physio", ...patch };
}

export function BusinessProviders({
  business,
  role,
  me,
  children,
}: {
  business: Business;
  role: MemberRole;
  me: Me;
  children: ReactNode;
}) {
  return (
    <BusinessContextProvider value={{ business: { ...business, myRole: role }, role, me }}>
      <VocabularyProvider vocabulary={business.vocabulary}>{children}</VocabularyProvider>
    </BusinessContextProvider>
  );
}

export function renderBusinessScreen(
  ui: ReactElement,
  {
    role = "owner",
    business: patch,
    me = meFixture,
    path = "",
    query,
    routes = {},
    ...providers
  }: BusinessScreenOptions = {},
) {
  const business = testBusiness(patch);
  const client = providers.client ?? testQueryClient();
  const route = `dashboard/[slug]${path ? `/${path}` : ""}`;
  const result = renderRouter(
    // A stack, as in the app (BusinessStack): screens set their header (title, Save, Invite) through it.
    { _layout: () => <Stack />, [route]: () => ui, ...routes },
    {
      initialUrl: `/dashboard/${business.slug}${path ? `/${path}` : ""}${query ? `?${query}` : ""}`,
      wrapper: ({ children }) => (
        <Providers auth={providers.auth} client={client} scheme={providers.scheme}>
          <BusinessProviders business={business} role={role} me={me}>
            {children as ReactElement}
          </BusinessProviders>
        </Providers>
      ),
    },
  );
  return { ...result, queryClient: client, business };
}
