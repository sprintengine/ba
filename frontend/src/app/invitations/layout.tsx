import { AppProviders } from "@/app/app-providers";
import { protectRoute } from "@/lib/auth/server";
import { RequireAuth } from "@/lib/auth/components";
import { FullPageLoader } from "@/components/common/feedback";
import { MinimalShell } from "@/components/shells/minimal-shell";
import { UserMenu } from "@/components/shells/user-menu";

/** Invitation links need a signed-in user: guarded on the server (Clerk), and client-side in dev auth. */
export default async function InvitationsLayout({ children }: { children: React.ReactNode }) {
  await protectRoute();
  return (
    <AppProviders>
      <RequireAuth fallback={<FullPageLoader />}>
        <MinimalShell width="narrow" actions={<UserMenu />}>
          {children}
        </MinimalShell>
      </RequireAuth>
    </AppProviders>
  );
}
