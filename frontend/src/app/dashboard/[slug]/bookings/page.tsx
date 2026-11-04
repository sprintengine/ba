import { Suspense } from "react";
import { BookingsList } from "@/components/dashboard/bookings/bookings-list";

export default function BookingsPage() {
  return (
    <Suspense>
      <BookingsList />
    </Suspense>
  );
}
