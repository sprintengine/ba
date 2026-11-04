import { AppProviders } from "@/app/app-providers";
import { protectRoute } from "@/lib/auth/server";
import { RequireAuth } from "@/lib/auth/components";
import { FullPageLoader } from "@/components/common/feedback";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MinimalShell } from "@/components/shells/minimal-shell";
import { UserMenu } from "@/components/shells/user-menu";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  await protectRoute();
  return (
    <AppProviders>
      <RequireAuth fallback={<FullPageLoader />}>
        <MinimalShell
          actions={
            <>
              <NotificationBell />
              <UserMenu />
            </>
          }
        >
          {children}
        </MinimalShell>
      </RequireAuth>
    </AppProviders>
  );
}
