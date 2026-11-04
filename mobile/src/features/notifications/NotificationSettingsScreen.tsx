/**
 * `/my/notifications` (the website's page): everything recent, push notifications on this device, and which kinds are
 * also emailed (team kinds only for members of a business).
 */
import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useMe } from "@shared/api/hooks/use-me";
import {
  useMarkAllNotificationsRead,
  useNotifications,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@shared/api/hooks/use-notifications";
import type { NotificationKind } from "@shared/api/types";
import { Button, Card, ErrorState, Screen, Skeleton, Switch, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { NotificationList } from "./NotificationList";
import { PushPermissionCard } from "./push/PushPermissionCard";

export function NotificationSettingsScreen() {
  const list = useNotifications();
  const readAll = useMarkAllNotificationsRead();
  const unread = list.data?.unreadCount ?? 0;
  return (
    <Screen testID="notification-settings">
      <Stack.Screen options={{ title: "Notifications" }} />
      <NotificationList
        header={
          <View style={styles.header}>
            <Text variant="callout" tone="muted">
              What happened that you should know about. You always see them here; you choose which are also
              emailed.
            </Text>
            <PushPermissionCard always />
            {unread > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                label="Mark all read"
                loading={readAll.isPending}
                onPress={() => readAll.mutate()}
              />
            ) : null}
          </View>
        }
        footer={<EmailSettings />}
      />
    </Screen>
  );
}

function EmailSettings() {
  const me = useMe();
  const settings = useNotificationSettings();
  const toast = useToast();
  const update = useUpdateNotificationSettings();
  const isMember = (me.data?.memberships.length ?? 0) > 0;
  const kinds = settings.data?.items.filter((k) => k.forCustomers || (isMember && k.forMembers)) ?? [];

  const toggle = (kind: NotificationKind, on: boolean) =>
    update.mutate(
      { [kind]: on },
      {
        onSuccess: () => toast.show(on ? "You'll get these by email" : "No more emails for these"),
        onError: (err) => toast.show(errorMessage(err), "danger"),
      },
    );

  return (
    <View style={styles.email} testID="email-settings">
      <Text variant="title3">Email me about</Text>
      <Text variant="callout" tone="muted">
        Sent to {me.data?.user.email ?? "your account email"}, a minute later, unless you&apos;ve opened it
        here by then.
      </Text>
      <Card>
        {settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : !settings.data || me.isPending ? (
          <View style={styles.loading}>
            <Skeleton height={96} />
          </View>
        ) : (
          kinds.map((k) => (
            <Switch
              key={k.kind}
              label={k.label}
              description={k.description}
              value={k.email}
              disabled={update.isPending}
              onValueChange={(on) => toggle(k.kind, on)}
              testID={`email-${k.kind}`}
            />
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[3] },
  email: { padding: space[4], gap: space[2] },
  loading: { padding: space[4] },
});
