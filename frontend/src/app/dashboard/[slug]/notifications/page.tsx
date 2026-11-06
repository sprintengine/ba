import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { PageContainer } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function Page() {
  return (
    <PageContainer>
      <NotificationsPage inDashboard />
    </PageContainer>
  );
}
