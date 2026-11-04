"use client";

import { ThemeProvider } from "@/lib/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";

/**
 * What every page needs: the theme and the toasts. Auth and data fetching are mounted by the route groups that use
 * them (app-providers.tsx), so the marketing pages don't ship Clerk.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
