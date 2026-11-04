import type { Metadata } from "next";
import { AppProviders } from "@/app/app-providers";
import { MinimalShell } from "@/components/shells/minimal-shell";

export const metadata: Metadata = {
  title: { absolute: "Connect an app · bookanything" },
  robots: { index: false, follow: false },
};

export default function AuthorizeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <MinimalShell width="narrow" className="py-8 sm:py-14">
        {children}
      </MinimalShell>
    </AppProviders>
  );
}
