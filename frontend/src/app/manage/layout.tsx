import { AppProviders } from "@/app/app-providers";

/** Managing a booking by its link: a signed-in customer is offered My bookings, so it needs auth and the query client. */
export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
