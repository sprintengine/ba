import type { Metadata } from "next";
import { CustomerRequestsPage } from "@/components/oauth/customer-approvals";

export const metadata: Metadata = { title: "Approvals", robots: { index: false } };

export default function Page() {
  return <CustomerRequestsPage />;
}
