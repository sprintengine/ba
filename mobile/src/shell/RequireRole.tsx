import type { ReactNode } from "react";
import { Lock } from "lucide-react-native";
import type { MemberRole } from "@shared/api/types";
import { usePermissions } from "@shared/business/business-context";
import { EmptyState, Screen } from "~/ui";

const WHO: Record<MemberRole, string> = {
  owner: "the owner",
  admin: "owners and admins",
  staff: "members",
};

/**
 * Shows its children only to members with at least `min` (the nav already hides the section; this covers deep links
 * and notifications). The backend enforces the same rule.
 */
export function RequireRole({ min, children }: { min: MemberRole; children: ReactNode }) {
  const { can } = usePermissions();
  if (can(min)) return <>{children}</>;
  return (
    <Screen testID="forbidden">
      <EmptyState
        icon={Lock}
        title="Not available for your role"
        description={`Only ${WHO[min]} can see this.`}
      />
    </Screen>
  );
}
