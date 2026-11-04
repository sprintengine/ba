import type { Metadata } from "next";
import { Suspense } from "react";
import { MyBookingsPage } from "@/components/booking/my-bookings";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <MyBookingsPage />
    </Suspense>
  );
}
