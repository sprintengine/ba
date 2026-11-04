"use client";

import { LayoutDashboard } from "lucide-react";
import { useMe } from "@/lib/api/hooks";
import { UserMenu } from "@/components/shells/user-menu";
import { ActionButton } from "@/components/ui/action-button";

/** Header actions: an exit for owners who already have a business, and the user menu. */
export function OnboardingHeaderActions() {
  const me = useMe();
  // /dashboard sends people without a business straight back here, so only offer it to members.
  const hasBusiness = (me.data?.memberships.length ?? 0) > 0;
  return (
    <>
      {hasBusiness && (
        // A named glyph on phones, where the header has no room for the words.
        <ActionButton
          href="/dashboard"
          icon={<LayoutDashboard />}
          label="Back to dashboard"
          variant="ghost"
          size="sm"
        />
      )}
      <UserMenu />
    </>
  );
}
