"use client";

import { usePathname } from "next/navigation";
import { isLightOnlyPath } from "@/lib/theme/light-only-routes";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { Toaster } from "@/components/ui/toast";

/**
 * What every page needs: the theme and the toasts. Auth and data fetching are mounted by the route groups that use
 * them (app-providers.tsx), so the marketing pages don't ship Clerk.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ThemeProvider forcedTheme={isLightOnlyPath(pathname) ? "light" : undefined}>
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
