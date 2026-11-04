import type { Metadata } from "next";
import { DevCheckout } from "@/components/booking/dev-checkout";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false, follow: false } };

/** Dev payment provider's simulated checkout (architecture §7). Hidden in production by dev/layout.tsx. */
export default async function DevCheckoutPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <DevCheckout paymentId={paymentId} />;
}
