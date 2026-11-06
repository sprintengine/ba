"use client";

import { Bell, CheckCheck } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import {
  useMarkAllNotificationsRead,
  useMe,
  useNotifications,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { NotificationList } from "./notification-bell";

/** /my/notifications (§22): everything recent, and which kinds are also emailed. */
export function NotificationsPage({ inDashboard = false }: { inDashboard?: boolean }) {
  const list = useNotifications();
  const readAll = useMarkAllNotificationsRead();
  const unread = list.data?.unreadCount ?? 0;
  const me = useMe();
  // Reached from the dashboard's bell as well: the team go back there, customers to their bookings.
  const member = (me.data?.memberships.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        back={
          inDashboard
            ? undefined
            : member
              ? { href: "/dashboard", label: "Today" }
              : { href: "/my/bookings", label: "My bookings" }
        }
        actions={
          <>
            {(list.data?.items.length ?? 0) > 0 && (
              <Button asChild variant="ghost">
                <a href="#email">Email settings</a>
              </Button>
            )}
            {unread > 0 && (
              <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>
                <CheckCheck /> Mark all read
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <div className={cn(list.data?.items.length && "border-y border-border")}>
          {list.isError ? (
            <ErrorState headingLevel={2} error={list.error} onRetry={() => list.refetch()} />
          ) : list.isPending ? (
            <div className="flex flex-col gap-2 p-4" role="status" aria-label="Loading notifications">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : list.data.items.length === 0 ? (
            <EmptyState
              headingLevel={2}
              size="sm"
              icon={<Bell />}
              title="Nothing yet"
              description="Anything that needs your attention shows up here."
            />
          ) : (
            <NotificationList items={list.data.items} />
          )}
        </div>
        <EmailSettings />
      </div>
    </>
  );
}

/** Which kinds are emailed: only those this person can get (team kinds only for members of a business). */
function EmailSettings() {
  const me = useMe();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const isMember = (me.data?.memberships.length ?? 0) > 0;
  const kinds = settings.data?.items.filter((k) => k.forCustomers || (isMember && k.forMembers)) ?? [];

  const toggle = (kind: (typeof kinds)[number]["kind"], on: boolean) =>
    update.mutate(
      { [kind]: on },
      {
        onSuccess: () => toast.success(on ? "You'll get these by email" : "No more emails for these"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <section id="email" aria-labelledby="email-title" className="flex scroll-mt-20 flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 id="email-title" className="text-sm font-semibold tracking-tight">
          Email me about
        </h2>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          Sent to {me.data?.user.email ?? "your account email"} a minute later, unless you&rsquo;ve opened it
          here.
        </p>
      </div>
      <Card variant="panel" className="rounded-2xl p-4.5">
        {settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        ) : !settings.data || me.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <fieldset className="flex flex-col gap-3" disabled={update.isPending}>
            <legend className="sr-only">Notifications to email</legend>
            {kinds.map((k) => (
              <label key={k.kind} className="flex items-start justify-between gap-4 text-sm">
                <span className="flex flex-col gap-0.5">
                  <span className="leading-5 font-medium">{k.label}</span>
                  <span className="text-muted-foreground">{k.description}</span>
                </span>
                <Switch
                  aria-label={k.label}
                  className="mt-0.5"
                  checked={k.email}
                  onCheckedChange={(on) => toggle(k.kind, on)}
                />
              </label>
            ))}
          </fieldset>
        )}
      </Card>
    </section>
  );
}
