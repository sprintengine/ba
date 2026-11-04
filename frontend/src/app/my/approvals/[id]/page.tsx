import type { Metadata } from "next";
import { CustomerRequestPage } from "@/components/oauth/customer-approvals";

export const metadata: Metadata = { title: "Approve a request", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerRequestPage id={id} />;
}
