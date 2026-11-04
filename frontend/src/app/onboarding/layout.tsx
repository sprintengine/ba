import { AppProviders } from "@/app/app-providers";
import { protectRoute } from "@/lib/auth/server";
import { RequireAuth } from "@/lib/auth/components";
import { FullPageLoader } from "@/components/common/feedback";
import { OnboardingHeaderActions } from "@/components/onboarding/onboarding-header-actions";
import { MinimalShell } from "@/components/shells/minimal-shell";

// Wide shell: the review step uses a two-column layout with a sticky summary; other steps
// constrain themselves to a readable measure.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await protectRoute();
  return (
    <AppProviders>
      <RequireAuth fallback={<FullPageLoader />}>
        <MinimalShell width="wide" actions={<OnboardingHeaderActions />}>
          {children}
        </MinimalShell>
      </RequireAuth>
    </AppProviders>
  );
}
