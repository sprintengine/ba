import { CustomerDetailView } from "@/components/dashboard/customers/customer-detail";

export default async function CustomerPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params;
  return <CustomerDetailView customerId={id} />;
}
