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
import { BusinessStrip } from "./business-strip";
import { DashboardRail, SidebarContent } from "./dashboard-sidebar";
import { DashboardTabBar } from "./dashboard-tab-bar";
import { useShellShortcuts } from "./use-shell-shortcuts";
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
   * A floating element (the assistant's launcher): at the foot of the rail from iPad portrait up, which keeps room
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
 *  - `sm` and up: the 80px rail, with its five labelled items.
 * The page runs flush to the rail. Pages supply their own <PageHeader> and width (see <PageContainer>).
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
  const [commandOpen, setCommandOpen] = useState(false);
  const commandMenuReady = useIdleMount(loadCommandMenu, commandOpen);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const toggleCommand = useCallback(() => setCommandOpen((o) => !o), []);
  // The calendar fills the window and scrolls inside it, so its names and times stay pinned.
  const fillsWindow = pathname.endsWith("/calendar");
  useShellShortcuts({ onToggleCommand: toggleCommand });

  useEffect(() => {
    // Close the navigation sheet on navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-background [--tab-bar-height:3.5rem]">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh w-20 shrink-0 flex-col bg-surface-sunken sm:flex",
          // Room at the foot for the floating launcher (3.5rem, 1rem or the safe area off the bottom).
          floating && "pb-[calc(4rem+max(1rem,env(safe-area-inset-bottom)))]",
        )}
      >
        <DashboardRail
          business={business}
          role={role}
          memberships={memberships}
          onOpenCommand={() => setCommandOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
          className="flex-1 bg-background transition-[padding] duration-200 motion-reduce:transition-none xl:pr-(--inspector-width,0px)"
        >
          {/* Phones keep the last row clear of the tab bar (and the home indicator under it); with Bo's launcher
              floating over the corner, the last row can also scroll clear of it. */}
          <div
            className={cn(
              fillsWindow
                ? "h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-var(--tab-bar-height)-env(safe-area-inset-bottom))] sm:h-dvh"
                : "px-4 pt-6 pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1.5rem)] sm:px-6 sm:py-8 lg:px-10",
              !fillsWindow &&
                floating &&
                "pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+5.5rem)] sm:pb-8",
            )}
          >
            {business && (
              <BusinessStrip slug={business.slug} role={role} sitesEnabled={!!business.sitesEnabled} />
            )}
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

      {/* The full navigation over the page: "More" on phones */}
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
            // the edge); on phones it rides above the tab bar. From sm it sits in the room kept at the rail's foot.
            "fixed top-[calc(100dvh_-_3.5rem_-_max(1rem,env(safe-area-inset-bottom)))] left-3 z-40",
            "max-sm:top-auto max-sm:right-3 max-sm:bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+0.75rem)] max-sm:left-auto",
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
