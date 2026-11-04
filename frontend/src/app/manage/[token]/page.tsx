import type { Metadata } from "next";
import { Suspense } from "react";
import { ManageBookingPage } from "@/components/booking/manage-booking";

export const metadata: Metadata = {
  title: "Manage your booking",
  // Personal, token-based page: keep it out of search engines.
  robots: { index: false, follow: false },
};

/** Guest "manage your booking" page, reached from the confirmation email or right after booking. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <ManageBookingPage token={token} />
    </Suspense>
  );
}
