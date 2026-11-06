import type { Viewport } from "next";
import { MarketingShell } from "@/components/shells/marketing-shell";

/** The website is light only (see lib/theme/light-only-routes.ts), so the browser's bar stays light on a dark phone. */
export const viewport: Viewport = { themeColor: "#fafafa" };

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
