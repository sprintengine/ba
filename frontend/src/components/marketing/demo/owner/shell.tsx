"use client";

import {
  BadgePercent,
  BarChart3,
  Boxes,
  CalendarCheck2,
  CalendarDays,
  ChevronsUpDown,
  ExternalLink,
  LayoutGrid,
  PanelLeftClose,
  Search,
  Settings,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";
import { BoCharacter } from "@/components/assistant/bo-character";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { BusinessTile } from "@/components/shells/business-tile";
import { cn } from "@/lib/utils";
import { useDemoTarget } from "../engine/demo-context";
import { BUSINESS, type Route } from "./state";

/** The sidebar as the physio sees it (their vocabulary: Appointments, Clients, Therapists). */
const NAV: { key: string; label: string; icon: typeof LayoutGrid; route?: Route }[] = [
  { key: "overview", label: "Today", icon: LayoutGrid, route: "overview" },
  { key: "calendar", label: "Calendar", icon: CalendarDays, route: "calendar" },
  { key: "bookings", label: "Appointments", icon: CalendarCheck2 },
  { key: "customers", label: "Clients", icon: Users },
  { key: "services", label: "Services", icon: Sparkles, route: "services" },
  { key: "offers", label: "Offers", icon: BadgePercent },
  { key: "therapists", label: "Therapists", icon: Boxes, route: "therapists" },
  { key: "team", label: "Team", icon: UsersRound },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
];

function NavItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const t = useDemoTarget(`nav-${item.key}`);
  const hover = t.hovered && !active;
  return (
    <span
      {...t.props}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors",
        active
          ? "bg-surface text-foreground shadow-xs ring-1 ring-border dark:bg-accent dark:ring-transparent"
          : "text-muted-foreground",
        hover && "bg-accent text-foreground",
      )}
    >
      <item.icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-brand" : hover ? "text-muted-foreground" : "text-subtle-foreground",
        )}
      />
      <span className="truncate">{item.label}</span>
    </span>
  );
}

function Sidebar({ route }: { route: Route }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 px-2.5 py-3">
      <div className="flex h-11 items-center gap-2.5 rounded-lg px-1.5">
        <BusinessTile name={BUSINESS.name} color={BUSINESS.color} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-5 font-semibold">{BUSINESS.name}</span>
          <span className="truncate text-xs text-subtle-foreground">Owner</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
      </div>
      <div className="mt-2 mb-1">
        <div className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-subtle-foreground shadow-xs">
          <Search className="size-3.5" />
          <span className="flex-1">Search…</span>
          <span className="flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
      <nav className="flex flex-col gap-px">
        {NAV.map((item) => (
          <NavItem key={item.key} item={item} active={item.route === route} />
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        <span className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground">
          <ExternalLink className="size-4 shrink-0 text-subtle-foreground" /> View booking page
        </span>
        <span className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground">
          <PanelLeftClose className="size-4 text-subtle-foreground" /> Collapse
        </span>
        <div className="mt-1 flex items-center gap-2.5 border-t border-border px-1.5 pt-2.5 pb-1">
          <Avatar name="Avery Morgan" size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-5 font-medium">Avery Morgan</span>
            <span className="truncate text-xs text-subtle-foreground">avery@lumenphysio.ie</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
        </div>
      </div>
    </aside>
  );
}

function BoLauncher({ hidden }: { hidden: boolean }) {
  const t = useDemoTarget("bo-launcher");
  return (
    <span
      {...t.props}
      className={cn(
        "absolute bottom-4 left-64 z-20 flex size-14 items-center justify-center rounded-full bg-surface-raised shadow-lg ring-1 ring-border transition-[transform,opacity] duration-200",
        t.hovered && "scale-105",
        hidden && "opacity-0",
      )}
    >
      <BoCharacter mood={t.hovered ? "attention" : "idle"} size={50} />
    </span>
  );
}

/** The dashboard frame: sidebar, the rounded main card, Bo's launcher (`bo`) and what floats above (sheets, toasts). */
export function DemoShell({
  route,
  bo,
  boOpen,
  scroll = 0,
  children,
  overlays,
}: {
  route: Route;
  /** Draw Bo's launcher (only where the public pages present Bo). */
  bo: boolean;
  boOpen: boolean;
  scroll?: number;
  children: React.ReactNode;
  overlays?: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full bg-surface-sunken text-foreground">
      <Sidebar route={route} />
      <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
        <main className="relative flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-xs">
          <div
            className="h-full px-10 py-8 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: scroll ? `translateY(-${String(scroll)}px)` : undefined }}
          >
            {children}
          </div>
        </main>
      </div>
      {bo && <BoLauncher hidden={boOpen} />}
      {overlays}
    </div>
  );
}
