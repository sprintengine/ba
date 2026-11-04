/**
 * Render a business-day screen (Today, Calendar, Bookings, Customers, Approvals: `/dashboard/[slug]/…`) without the
 * whole app: the business context, vocabulary and a section's booking actions (the new-booking form) around it,
 * inside the in-memory router of `renderScreen`. The business, role and `Me` are the website's fixtures unless given.
 */
import type { ReactElement } from "react";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { Business, Me, MemberRole } from "@shared/api/types";
import { BusinessContextProvider } from "@shared/business/business-context";
import { VocabularyProvider } from "@shared/vocabulary";
import { BookingActionsProvider, type BookingSection } from "~/features/bookings/BookingActions";
import { renderScreen, type ScreenOptions } from "./render";

export const testBusiness: Business = businessFixture;
export const B = `/v1/businesses/${businessFixture.id}`;

export type OpsScreenOptions = ScreenOptions & {
  role?: MemberRole;
  business?: Business;
  me?: Me;
  section?: BookingSection;
};

export function renderOpsScreen(ui: ReactElement, options: OpsScreenOptions = {}) {
  const {
    role = "owner",
    business = businessFixture,
    me = meFixture,
    section = "bookings",
    routes = {},
  } = options;
  const wrap = (el: ReactElement) => (
    <BusinessContextProvider value={{ business, role, me }}>
      <VocabularyProvider vocabulary={business.vocabulary}>
        <BookingActionsProvider section={section}>{el}</BookingActionsProvider>
      </VocabularyProvider>
    </BusinessContextProvider>
  );
  const wrapped = Object.fromEntries(
    Object.entries(routes).map(([name, render]) => [name, () => wrap(render())]),
  );
  return renderScreen(wrap(ui), { ...options, routes: wrapped });
}
