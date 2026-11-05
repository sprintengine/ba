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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxItem } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { NotificationList } from "./notification-bell";

/** /my/notifications (§22): everything recent, and which kinds are also emailed. */
export function NotificationsPage() {
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
          member ? { href: "/dashboard", label: "Today" } : { href: "/my/bookings", label: "My bookings" }
        }
        description={
          <a href="#email" className="underline-offset-2 hover:text-foreground hover:underline">
            Choose what&rsquo;s emailed
          </a>
        }
        actions={
          unread > 0 ? (
            <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>
              <CheckCheck /> Mark all read
            </Button>
          ) : undefined
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
              icon={<Bell />}
              title="Nothing yet"
              description="When something needs your attention, like a change your AI agent wants you to approve, it shows up here."
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
    <Card id="email" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Email me about</CardTitle>
        <CardDescription>
          Sent to {me.data?.user.email ?? "your account email"} a minute later, unless you&rsquo;ve opened it
          here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        ) : !settings.data || me.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <fieldset className="flex flex-col gap-3" disabled={update.isPending}>
            <legend className="sr-only">Notifications to email</legend>
            {kinds.map((k) => (
              <CheckboxItem
                key={k.kind}
                label={k.label}
                description={k.description}
                checked={k.email}
                onCheckedChange={(on) => toggle(k.kind, on === true)}
              />
            ))}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
