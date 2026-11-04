import { AgentRequestPage } from "@/components/assistant/agent-requests";

export default async function ApprovalPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params;
  return <AgentRequestPage id={id} />;
}
