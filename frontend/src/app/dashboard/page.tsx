"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/api/hooks";
import { accountHomePath } from "@/lib/auth/components";
import { ErrorState, FullPageLoader } from "@/components/common/feedback";

/**
 * /dashboard → first membership's dashboard; without one, My bookings for customers who have booked, else
 * onboarding.
 */
export default function DashboardIndex() {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (!me.data) return;
    const first = me.data.memberships[0];
    router.replace(first ? `/dashboard/${first.slug}` : accountHomePath(me.data));
  }, [me.data, router]);

  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }
  return <FullPageLoader label="Opening your dashboard" />;
}
