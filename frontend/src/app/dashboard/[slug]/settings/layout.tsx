"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { NoAccess } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref, settingsNavText, visibleSettings } from "@/components/shells/dashboard-nav";
import { PageHeader } from "@/components/ui/page-header";

/** Settings: section nav (left on desktop, scrollable pills on phones and iPad portrait) + section content. Admin+. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const pathname = usePathname();
  if (!perms.manageSettings) {
    return (
      <NoAccess
        title="Settings are for admins"
        description="Ask an owner or admin of this business to change settings."
        backHref={dashboardHref(business.slug)}
        backLabel="Back to overview"
        inShell
      />
    );
  }
  const items = visibleSettings(business, perms.can);
  return (
    <PageContainer size="default">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav
          aria-label="Settings"
          className="-mx-1 flex snap-x snap-mandatory scroll-pl-1 scrollbar-none gap-1 overflow-x-auto px-1 max-lg:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] max-lg:pr-10 lg:sticky lg:top-8 lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:self-start lg:px-0"
        >
          {items.map((item) => {
            const href = dashboardHref(business.slug, `settings/${item.segment}`);
            const active = pathname === href;
            return (
              <Link
                key={item.segment}
                href={href}
                aria-current={active ? "page" : undefined}
                // On phones the sections scroll sideways: keep the current one in view.
                ref={active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:h-11",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {settingsNavText(item, v).label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageContainer>
  );
}
