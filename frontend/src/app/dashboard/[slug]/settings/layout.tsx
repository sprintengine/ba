"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { NoAccess } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref, settingsNavText, visibleSettings } from "@/components/shells/dashboard-nav";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The rail's sections, each under a small heading. A segment not listed here sits after them. */
const NAV_SECTIONS: { title: string; segments: string[] }[] = [
  { title: "Your business", segments: ["general", "branding"] },
  { title: "Booking rules", segments: ["policies", "release-schedules", "customer-groups", "questions"] },
  { title: "Reach", segments: ["marketplace", "ai-agents"] },
  { title: "Money", segments: ["payments", "billing"] },
];

type Section = {
  title: string | null;
  items: { segment: string; href: string; label: string; description: string }[];
};

/** Phones and iPad portrait: where you are, and the whole grouped list one tap away. */
function SectionPicker({ sections, pathname }: { sections: Section[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const current = sections.flatMap((s) => s.items).find((i) => i.href === pathname);
  return (
    <div className="lg:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" block className="justify-between" aria-label="Settings sections">
            {current?.label ?? "Settings"}
            <ChevronsUpDown aria-hidden className="text-subtle-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-[70dvh] w-[calc(100vw-2rem)] overflow-y-auto p-1.5 sm:w-96"
        >
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col pb-1.5 last:pb-0">
              {section.title && (
                <span className="px-2 pt-1.5 pb-1 text-xs font-medium text-subtle-foreground">
                  {section.title}
                </span>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.segment}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </Link>
              ))}
            </div>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Settings: section nav (left on desktop, a picker on phones and iPad portrait) + section content, as one column of a
 * readable width that stays centred however wide the window. Admin+.
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
  const link = (item: (typeof items)[number]) => ({
    segment: item.segment,
    href: dashboardHref(business.slug, `settings/${item.segment}`),
    ...settingsNavText(item, v),
  });
  const sections: Section[] = [
    ...NAV_SECTIONS.map((section) => ({
      title: section.title,
      items: items.filter((item) => section.segments.includes(item.segment)).map(link),
    })),
    { title: null, items: items.filter((item) => !known.includes(item.segment)).map(link) },
  ].filter((section) => section.items.length > 0);
  return (
    <PageContainer size="wide">
      <PageHeader title="Settings" className="pb-0" />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[11rem_minmax(0,45rem)] lg:justify-center lg:gap-x-9">
        <SectionPicker sections={sections} pathname={pathname} />
        <nav
          aria-label="Settings"
          className="hidden lg:sticky lg:top-8 lg:flex lg:flex-col lg:gap-5 lg:self-start"
        >
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-0.5">
              {section.title && (
                <span className="mb-1 px-3 text-xs font-medium text-subtle-foreground">{section.title}</span>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.segment}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-surface text-foreground shadow-[0_0_0_1px_var(--border),var(--shadow-xs)] dark:bg-surface-raised"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
