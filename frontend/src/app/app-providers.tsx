"use client";

import { QueryProvider } from "@/lib/api/query-provider";
import { AuthProvider } from "@/lib/auth/auth-provider";

/**
 * Auth (Clerk or dev auth) and TanStack Query, for the route groups that use them: the dashboard, My bookings,
 * onboarding, invitations, connecting an app, sign-in, a business's pages, managing a booking and /dev. Each of their
 * layouts mounts this; the marketing pages don't, so they ship neither Clerk nor the query client (their nav only
 * needs a hint of whether someone is signed in: lib/auth/signed-in-hint.ts; Explore mounts `PublicQueryProvider`
 * alone). The query cache is shared across the groups (lib/api/query-provider.tsx). Don't add exports for other
 * pages here: whatever a layout imports from this module comes with Clerk.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>{children}</QueryProvider>
    </AuthProvider>
  );
}
