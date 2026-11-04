import type { Metadata } from "next";
import { ConnectedAppsPage } from "@/components/oauth/connected-apps";

export const metadata: Metadata = { title: "Connected apps", robots: { index: false } };

export default function Page() {
  return <ConnectedAppsPage />;
}
