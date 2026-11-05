"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/api/hooks";
import type { AppNotification } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/** Where a person sees all their notifications and chooses which are emailed. */
export const NOTIFICATIONS_PATH = "/my/notifications";

/** "Just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const PANEL_TITLE_ID = "notifications-panel-title";

/** "3", or "99+" past 99. */
const countLabel = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * The bell (§22): what happened that the person should know, newest first, with an unread count. Checks every half
 * minute and when the tab regains focus. `row` is the dashboard sidebar's row (a glyph alone when `collapsed`).
 */
export function NotificationBell({
  variant = "icon",
  collapsed = false,
  className,
  side,
  align = "end",
}: {
  variant?: "icon" | "row";
  collapsed?: boolean;
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
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[0.625rem] leading-none font-semibold text-background",
        variant === "icon" || collapsed ? "absolute -top-0.5 -right-0.5" : "ml-auto",
      )}
    >
      {countLabel(unread)}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "row" ? (
          <button type="button" aria-label={label} className={cn("relative", className)}>
            <Bell className="size-4 shrink-0 text-subtle-foreground" />
            {!collapsed && <span>Notifications</span>} {badge}
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
        <NotificationList items={items.slice(0, 10)} onNavigate={onNavigate} compact />
      )}
      <div className="border-t border-border-subtle px-3 py-2">
        <Link
          href={NOTIFICATIONS_PATH}
          onClick={onNavigate}
          className="text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          See all and choose what&rsquo;s emailed
        </Link>
      </div>
    </div>
  );
}

/** Notifications as links: opening one marks it read. */
export function NotificationList({
  items,
  onNavigate,
  compact = false,
}: {
  items: AppNotification[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const markRead = useMarkNotificationRead();
  return (
    <ul className={cn("flex flex-col divide-y divide-border-subtle", compact && "max-h-96 overflow-y-auto")}>
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={n.link}
            onClick={() => {
              if (!n.read) markRead.mutate(n.id);
              onNavigate?.();
            }}
            className="flex gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
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
              {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-xs text-subtle-foreground">
                {[n.businessName, timeAgo(n.createdAt)].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
