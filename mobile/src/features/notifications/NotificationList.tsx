import { FlashList } from "@shopify/flash-list";
import { useCallback, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useMarkNotificationRead, useNotifications } from "@shared/api/hooks/use-notifications";
import type { AppNotification } from "@shared/api/types";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { Divider, EmptyState, ErrorState, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { NotificationRow } from "./NotificationRow";
import { openNotificationLink } from "./open-notification";

/**
 * The person's notifications, newest first: opening one marks it read and goes where its link goes (the same screen
 * as on the website). Pull to refresh; refreshed when the screen comes back into view.
 */
export function NotificationList({
  fromModal = false,
  header,
  footer,
}: {
  /** In the inbox modal: it closes as a notification opens. */
  fromModal?: boolean;
  header?: ReactElement | null;
  footer?: ReactElement | null;
}) {
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const refresh = usePullToRefresh(list.refetch);
  useRefetchOnFocus(list.refetch);
  const { mutate } = markRead;

  const open = useCallback(
    (n: AppNotification) => {
      if (!n.read) mutate(n.id);
      openNotificationLink(n.link, { fromModal });
    },
    [mutate, fromModal],
  );
  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => <NotificationRow notification={item} onOpen={open} />,
    [open],
  );

  if (list.isError && !list.data) {
    return (
      <View style={styles.state}>
        {header}
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </View>
    );
  }
  if (!list.data) {
    return (
      <View
        style={styles.state}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading notifications"
      >
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </View>
    );
  }
  return (
    <FlashList
      data={list.data.items}
      keyExtractor={(n) => n.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={refresh.refreshing}
      onRefresh={refresh.onRefresh}
      ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : null}
      ListFooterComponent={footer ?? null}
      ListEmptyComponent={
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="When something needs you, like a change your AI agent wants you to approve, it shows up here."
          testID="notifications-empty"
        />
      }
      testID="notification-list"
    />
  );
}

function Separator() {
  return <Divider inset={space[4]} />;
}

const styles = StyleSheet.create({
  state: { padding: space[4], gap: space[3] },
  header: { padding: space[4], gap: space[3] },
});
