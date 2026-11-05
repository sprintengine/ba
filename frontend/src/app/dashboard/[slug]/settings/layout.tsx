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

/** The rail's sections, each under a small heading. A segment not listed here sits after them. */
const NAV_SECTIONS: { title: string; segments: string[] }[] = [
  { title: "Your business", segments: ["general", "branding"] },
  { title: "Booking rules", segments: ["policies", "release-schedules", "customer-groups", "questions"] },
  { title: "Reach", segments: ["marketplace", "ai-agents"] },
  { title: "Money", segments: ["payments", "billing"] },
];

/**
 * Settings: section nav (left on desktop, scrollable pills on phones and iPad portrait) + section content, as one
 * column of a readable width that stays centred however wide the window. Admin+.
 */
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
        backLabel="Back to Today"
        inShell
      />
    );
  }
  const items = visibleSettings(business, perms.can);
  const known = NAV_SECTIONS.flatMap((section) => section.segments);
  const sections = [
    ...NAV_SECTIONS.map((section) => ({
      title: section.title,
      items: items.filter((item) => section.segments.includes(item.segment)),
    })),
    { title: null, items: items.filter((item) => !known.includes(item.segment)) },
  ].filter((section) => section.items.length > 0);
  return (
    <PageContainer size="wide">
      <PageHeader title="Settings" className="pb-0" />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[13rem_minmax(0,45rem)] lg:justify-center lg:gap-x-11">
        <nav
          aria-label="Settings"
          className="-mx-1 flex snap-x snap-mandatory scroll-pl-6 scrollbar-none gap-1 overflow-x-auto px-1 max-lg:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-2.5rem),transparent)] max-lg:pr-10 lg:sticky lg:top-8 lg:mx-0 lg:flex-col lg:gap-5 lg:self-start lg:overflow-visible lg:px-0"
        >
          {sections.map((section) => (
            // On phones the sections run together as one row of pills.
            <div key={section.title} className="contents lg:flex lg:flex-col lg:gap-0.5">
              {section.title && (
                <span className="mb-1 hidden px-3 text-xs font-medium text-subtle-foreground lg:block">
                  {section.title}
                </span>
              )}
              {section.items.map((item) => {
                const href = dashboardHref(business.slug, `settings/${item.segment}`);
                const active = pathname === href;
                return (
                  <Link
                    key={item.segment}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    // On phones the sections scroll sideways: keep the current one in view.
                    ref={
                      active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "start" }) : undefined
                    }
                    className={cn(
                      "inline-flex shrink-0 snap-start items-center rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors pointer-coarse:h-11",
                      active
                        ? "bg-surface font-medium text-foreground shadow-[0_0_0_1px_var(--border),var(--shadow-xs)] dark:bg-surface-raised"
                        : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {settingsNavText(item, v).label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
