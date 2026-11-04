import { AppProviders } from "@/app/app-providers";
import { protectRoute } from "@/lib/auth/server";
import { RequireAuth } from "@/lib/auth/components";
import { FullPageLoader } from "@/components/common/feedback";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  await protectRoute();
  return (
    <AppProviders>
      <RequireAuth fallback={<FullPageLoader />}>{children}</RequireAuth>
    </AppProviders>
  );
}
