import type { Metadata } from "next";
import { AcceptInvitation } from "@/components/invitations/accept-invitation";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false, follow: false } };

/** Team invitation link from the email (architecture §13): accept after sign-in, then open the dashboard. */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitation token={token} />;
}
