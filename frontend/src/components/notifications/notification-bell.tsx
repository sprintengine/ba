"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/api/hooks";
import type { AppNotification } from "@/lib/api/types";
import { formatDay } from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/** Where a person sees all their notifications and chooses which are emailed. */
export const NOTIFICATIONS_PATH = "/my/notifications";

/** The same page inside the dashboard, so the team keep the rail; the business comes from the address. */
export function useNotificationsPath(): string {
  const slug = /^\/dashboard\/([^/]+)/.exec(usePathname())?.[1];
  return slug ? `/dashboard/${slug}/notifications` : NOTIFICATIONS_PATH;
}

/** How many the bell's panel shows: all of them whole, with the rest one click away. */
const PANEL_ITEMS = 6;

/** Local calendar day, for grouping. */
const dayKey = (at: Date) => `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;

/** "Today", "Yesterday", else "Tue, 3 Nov". */
function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (dayKey(at) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday)) return "Yesterday";
  return formatDay(at, Intl.DateTimeFormat().resolvedOptions().timeZone, DEFAULT_LOCALE, now);
}

/** Newest first as they come, under one heading per day. */
export function groupByDay(items: AppNotification[], now: Date = new Date()) {
  const days: { label: string; items: AppNotification[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.createdAt, now);
    const last = days.at(-1);
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }
  return days;
}

/** "Just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return formatDay(new Date(iso), Intl.DateTimeFormat().resolvedOptions().timeZone, DEFAULT_LOCALE);
}

const PANEL_TITLE_ID = "notifications-panel-title";

/** "3", or "99+" past 99. */
const countLabel = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * The bell (§22): what happened that the person should know, newest first, with an unread count. Checks every half
 * minute and when the tab regains focus. `row` is a row in the navigation sheet, `rail` an item in the dashboard rail (glyph over label).
 */
export function NotificationBell({
  variant = "icon",
  className,
  side,
  align = "end",
}: {
  variant?: "icon" | "row" | "rail";
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const list = useNotifications();
  const unread = list.data?.unreadCount ?? 0;
  // The badge's own text ("99+" past 99) is in the name, as a control's visible text must be (WCAG 2.5.3).
  const label = unread > 0 ? `Notifications, ${countLabel(unread)} unread` : "Notifications";

  const badge = unread > 0 && (
    <span
      aria-hidden
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-raised px-1 text-[0.625rem] leading-none font-semibold text-foreground ring-1 ring-border-strong",
        variant === "icon" && "absolute -top-0.5 -right-0.5",
        variant === "row" && "ml-auto",
        variant === "rail" && "absolute top-0.5 left-[calc(50%+0.25rem)]",
      )}
    >
      {countLabel(unread)}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "rail" ? (
          // The name holds what's on screen, word and count, in that order (WCAG 2.5.3).
          <button
            type="button"
            aria-label={unread > 0 ? `Alerts ${countLabel(unread)}, unread notifications` : "Alerts"}
            className={cn("relative", className)}
          >
            <Bell strokeWidth={1.75} />
            <span>Alerts</span> {badge}
          </button>
        ) : variant === "row" ? (
          <button type="button" aria-label={label} className={cn("relative", className)}>
            <Bell className="size-4 shrink-0 text-subtle-foreground" />
            <span>Notifications</span> {badge}
          </button>
        ) : (
          <IconButton label={label} tooltip={false} size="md" className={cn("relative", className)}>
            <Bell />
            {badge}
          </IconButton>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} aria-labelledby={PANEL_TITLE_ID} className="w-[22rem] p-0">
        <NotificationPanel onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** The bell's list: recent notifications, mark all read, and a link to all of them and their settings. */
function NotificationPanel({ onNavigate }: { onNavigate: () => void }) {
  const path = useNotificationsPath();
  const list = useNotifications();
  const readAll = useMarkAllNotificationsRead();
  const items = list.data?.items ?? [];
  const unread = list.data?.unreadCount ?? 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <h2 id={PANEL_TITLE_ID} className="text-sm font-semibold">
          Notifications
        </h2>
        {unread > 0 && (
          <Button size="sm" variant="ghost" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>
      {list.isPending ? (
        <div className="flex flex-col gap-2 p-3" role="status" aria-label="Loading notifications">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
          <BellOff className="size-5 text-subtle-foreground" aria-hidden />
          You&rsquo;re all caught up.
        </p>
      ) : (
        <NotificationList items={items.slice(0, PANEL_ITEMS)} onNavigate={onNavigate} />
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-3 py-2 text-sm">
        <Link
          href={path}
          onClick={onNavigate}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          {items.length > PANEL_ITEMS ? `All ${items.length} notifications` : "All notifications"}
        </Link>
        <Link
          href={`${path}#email`}
          onClick={onNavigate}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Email settings
        </Link>
      </div>
    </div>
  );
}

/** Notifications as links under a heading per day: opening one marks it read. */
/** How many of a run of one kind stay in view before the rest fold behind "N more like this". */
const RUN_SHOWN = 2;

type Folded = { key: string; more: number };

/** The items, with long runs of one kind folded, unless [opened] holds the run: a run's key is its first item's id. */
export function foldRuns(
  items: AppNotification[],
  opened: ReadonlySet<string>,
): (AppNotification | Folded)[] {
  const out: (AppNotification | Folded)[] = [];
  for (let i = 0; i < items.length;) {
    const first = items[i];
    if (!first) break;
    let end = i + 1;
    while (items[end]?.kind === first.kind) end += 1;
    const run = items.slice(i, end);
    const fold = run.length > RUN_SHOWN + 1 && !opened.has(first.id);
    out.push(...(fold ? run.slice(0, RUN_SHOWN) : run));
    if (fold) out.push({ key: first.id, more: run.length - RUN_SHOWN });
    i = end;
  }
  return out;
}

function Row({ n, detail, onOpen }: { n: AppNotification; detail: string; onOpen: () => void }) {
  return (
    <li>
      <Link
        href={n.link}
        onClick={onOpen}
        className="flex gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <span
          aria-hidden
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("leading-snug", n.read ? "text-muted-foreground" : "font-medium")}>
            {n.title}
            {!n.read && <span className="sr-only"> (unread)</span>}
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

export function NotificationList({
  items,
  onNavigate,
}: {
  items: AppNotification[];
  onNavigate?: () => void;
}) {
  const markRead = useMarkNotificationRead();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // The business only tells them apart when there is more than one.
  const several = new Set(items.map((n) => n.businessName).filter(Boolean)).size > 1;
  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    onNavigate?.();
  };
  const detail = (n: AppNotification, day: string) =>
    [n.body, several && n.businessName, day === "Today" && timeAgo(n.createdAt)].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col">
      {groupByDay(items).map((day) => (
        <section key={day.label} aria-label={day.label}>
          <h3 className="bg-popover/95 sticky top-0 z-10 flex items-baseline justify-between px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {day.label}
          </h3>
          <ul className="flex flex-col">
            {foldRuns(day.items, opened).map((entry) =>
              "more" in entry ? (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => setOpened((was) => new Set(was).add(entry.key))}
                    className="w-full py-1.5 pr-3 pl-7.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  >
                    {entry.more} more like this
                  </button>
                </li>
              ) : (
                <Row key={entry.id} n={entry} detail={detail(entry, day.label)} onOpen={() => open(entry)} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
