/**
 * Who is signed in and where they land. `/v1/me` decides: members get the business experience (the business they
 * last opened), everyone gets the customer experience (architecture §3.3 "After sign-in").
 */
import type { Href } from "expo-router";
import { useMe } from "@shared/api/hooks/use-me";
import type { Me } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import { prefs, PREF } from "~/lib/storage";

/** `/v1/me` for the signed-in user (disabled while signed out). */
export function useSignedInMe() {
  const { isSignedIn } = useAuth();
  return useMe({ enabled: isSignedIn });
}

export type Experience = "customer" | "business";

export type LastVisit = { business?: string | null; experience?: string | null };

/** Where to open the app: the last business (still a member) unless they last used the customer side. */
export function homeHref(me: Me, last: LastVisit): Href {
  const memberships = me.memberships;
  if (memberships.length > 0 && last.experience !== "customer") {
    const slug = (memberships.find((m) => m.slug === last.business) ?? memberships[0]!).slug;
    return `/dashboard/${slug}`;
  }
  return me.hasCustomerBookings || memberships.length > 0 ? "/my/bookings" : "/explore";
}

export function lastVisit(): LastVisit {
  return {
    business: prefs().getString(PREF.lastBusiness),
    experience: prefs().getString(PREF.lastExperience),
  };
}

/** Remember the experience (and business) in use, for the next launch. */
export function rememberVisit(experience: Experience, businessSlug?: string) {
  prefs().set(PREF.lastExperience, experience);
  if (businessSlug) prefs().set(PREF.lastBusiness, businessSlug);
}
