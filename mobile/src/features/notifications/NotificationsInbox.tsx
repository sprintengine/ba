/**
 * The bell's inbox (`/notifications`, a modal over any screen; architecture §22): what needs the person, newest first,
 * with Mark all read, the offer to turn on push notifications, and the way to all of them and the email choices.
 */
import { router, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { CheckCheck } from "lucide-react-native";
import { useMarkAllNotificationsRead, useNotifications } from "@shared/api/hooks/use-notifications";
import { Button, IconButton, Screen } from "~/ui";
import { space } from "~/ui/tokens";
import { NotificationList } from "./NotificationList";
import { PushPermissionCard } from "./push/PushPermissionCard";

export function NotificationsInbox() {
  const list = useNotifications();
  const readAll = useMarkAllNotificationsRead();
  const unread = list.data?.unreadCount ?? 0;
  return (
    <Screen testID="notifications-inbox">
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            unread > 0 ? (
              <IconButton
                icon={CheckCheck}
                accessibilityLabel="Mark all read"
                disabled={readAll.isPending}
                onPress={() => readAll.mutate()}
                testID="mark-all-read"
              />
            ) : null,
        }}
      />
      <NotificationList
        fromModal
        header={<PushPermissionCard />}
        footer={
          <View style={styles.footer}>
            <Button
              variant="ghost"
              label="See all and choose what's emailed"
              onPress={() => {
                if (router.canGoBack()) router.back();
                router.navigate("/my/notifications");
              }}
              testID="notification-settings-link"
            />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ footer: { padding: space[4], alignItems: "center" } });
