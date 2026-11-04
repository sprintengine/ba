"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { Membership, MemberRole } from "@/lib/api/types";
import { useIdleMount } from "@/lib/hooks/use-idle-mount";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BusinessSwitcher, type DashboardShellBusiness } from "./business-switcher";
import type { CommandMenuExtension } from "./command-menu";
import { SidebarContent } from "./dashboard-sidebar";
import { DashboardTabBar } from "./dashboard-tab-bar";
import { useShellShortcuts } from "./use-shell-shortcuts";
import { useIsWideLayout } from "./use-shell-layout";
import { useSidebarCollapse } from "./use-sidebar-collapse";
import { UserMenu } from "./user-menu";

/** ⌘K (cmdk, dictation, Bo's character) loads after the page, not with it: see useIdleMount. */
const loadCommandMenu = () => import("./command-menu");
const CommandMenu = dynamic(() => loadCommandMenu().then((m) => m.CommandMenu), { ssr: false });

type DashboardShellProps = {
  /** Current business; `null` while loading (renders skeleton chrome). */
  business: DashboardShellBusiness | null;
  role: MemberRole;
  memberships: Membership[];
  /** Extra ⌘K content, e.g. live search (see CommandMenu `extension`). */
  commandMenuExtension?: CommandMenuExtension;
  /**
   * A floating element (the assistant's launcher): at the foot of the sidebar from iPad portrait up, which keeps room
   * for it, so it never covers the page; over the bottom-right corner on phones, above the tab bar.
   */
  floating?: React.ReactNode;
  /** Adds "Ask Bo…" to ⌘K; receives what was typed. */
  onAskAssistant?: (question: string) => void;
  children: React.ReactNode;
};

/**
 * App chrome for /dashboard/[slug]/*, by device:
 *  - phones (below `sm`, 640px: the largest phone is 430px wide): a slim top bar (business switcher, search,
 *    account) and a bottom tab bar with the most used pages; "More" opens the full navigation as a sheet;
 *  - iPad portrait (`sm` to `lg`, from the 744px iPad mini up): the sidebar is a glyph rail; its expand control lays
 *    the labelled navigation over the page (the content keeps its width);
 *  - `lg` and up: the full sidebar, collapsible to the rail (⌘\), remembered.
 * Content renders in an inset panel; pages supply their own <PageHeader> and width (see <PageContainer>).
 */
export function DashboardShell({
  business,
  role,
  memberships,
  commandMenuExtension,
  floating,
  onAskAssistant,
  children,
}: DashboardShellProps) {
  const { collapsed, toggleCollapsed } = useSidebarCollapse();
  const wide = useIsWideLayout();
  const [commandOpen, setCommandOpen] = useState(false);
  const commandMenuReady = useIdleMount(loadCommandMenu, commandOpen);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const toggleCommand = useCallback(() => setCommandOpen((o) => !o), []);
  // Below `lg` the rail can't widen in place: ⌘\ and its expand control open the navigation over the page.
  const toggleSidebar = useCallback(() => {
    if (wide) toggleCollapsed();
    else setNavOpen((o) => !o);
  }, [wide, toggleCollapsed]);
  useShellShortcuts({ onToggleCommand: toggleCommand, onToggleSidebar: toggleSidebar });
  const rail = collapsed || !wide;

  useEffect(() => {
    // Close the navigation sheet on navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-surface-sunken [--tab-bar-height:3.5rem]">
      {/* Sidebar: a rail on iPad portrait, full (or collapsed to the rail) from `lg` */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 ease-out sm:flex",
          rail ? "w-15 pointer-coarse:w-17" : "w-60",
          // Room at the foot for the floating launcher (3.5rem, 1rem or the safe area off the bottom).
          floating && "pb-[calc(4rem+max(1rem,env(safe-area-inset-bottom)))]",
        )}
      >
        <SidebarContent
          business={business}
          role={role}
          memberships={memberships}
          collapsed={rail}
          onToggleCollapsed={toggleSidebar}
          onOpenCommand={() => setCommandOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col sm:py-2 sm:pr-2">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 box-content flex h-14 items-center gap-1 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur-xl sm:hidden">
          <div className="min-w-0 flex-1">
            <BusinessSwitcher business={business} memberships={memberships} collapsed={false} />
          </div>
          <IconButton label="Search" tooltip={false} size="md" onClick={() => setCommandOpen(true)}>
            <Search />
          </IconButton>
          <NotificationBell />
          <UserMenu />
        </header>

        <main
          id="main"
          className="flex-1 bg-background sm:rounded-xl sm:border sm:border-border sm:shadow-xs"
        >
          {/* Phones keep the last row clear of the tab bar (and the home indicator under it); with Bo's launcher
              floating over the corner, the last row can also scroll clear of it. */}
          <div
            className={cn(
              "px-4 pt-6 pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1.5rem)] sm:px-6 sm:py-8 lg:px-10",
              floating && "pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+5.5rem)] sm:pb-8",
            )}
          >
            {children}
          </div>
        </main>
      </div>

      <DashboardTabBar
        slug={business?.slug ?? null}
        role={role}
        moreOpen={navOpen}
        onOpenMore={() => setNavOpen(true)}
      />

      {/* The full navigation over the page: "More" on phones, the rail's expand control on iPad portrait */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          size="sm"
          className="w-72 bg-surface-sunken pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          hideClose
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            business={business}
            role={role}
            memberships={memberships}
            collapsed={false}
            onClose={() => setNavOpen(false)}
            onOpenCommand={() => {
              setNavOpen(false);
              setCommandOpen(true);
            }}
          />
        </SheetContent>
      </Sheet>

      {floating && (
        <div
          className={cn(
            // Anchored to the dynamic viewport so it stays above mobile browser toolbars (a 3.5rem launcher, 1rem off
            // the edge); on phones it rides above the tab bar. From sm it sits in the room kept at the sidebar's foot:
            // centred in the rail, in line with the full sidebar's items.
            "fixed top-[calc(100dvh_-_3.5rem_-_max(1rem,env(safe-area-inset-bottom)))] left-3 z-40 transition-[left] duration-200 ease-out",
            "max-sm:top-auto max-sm:right-3 max-sm:bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+0.75rem)] max-sm:left-auto",
            rail ? "sm:left-0.5 pointer-coarse:sm:left-1.5" : "sm:left-3",
          )}
        >
          {floating}
        </div>
      )}

      {business && commandMenuReady && (
        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          slug={business.slug}
          role={role}
          sitesEnabled={!!business.sitesEnabled}
          memberships={memberships}
          extension={commandMenuExtension}
          onAskAssistant={onAskAssistant}
        />
      )}
    </div>
  );
}
