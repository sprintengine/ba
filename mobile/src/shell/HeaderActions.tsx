import { router } from "expo-router";
import type { ReactNode } from "react";
import { Bell, Sparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useNotifications } from "@shared/api/hooks/use-notifications";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useAuth } from "@shared/auth/context";
import { useOptionalBusinessContext } from "@shared/business/business-context";
import { openAssistant } from "~/features/assistant/AssistantDock";
import { Button, IconButton, useLayout } from "~/ui";

/**
 * The header's right side: the notifications bell (with the unread count) and, for business screens, Bo where the
 * deployment offers it (`Business.assistantAvailable`, read from the business shell's context).
 * Pass it as `headerRight: () => <HeaderActions business={slug} />`; a screen's own action goes first, as a child
 * (`<HeaderActions business={slug}><IconButton icon={Plus} … /></HeaderActions>`).
 *
 * Signed out (Explore, a business's page, booking as a guest), Sign in instead of the bell, which isn't polled; signing
 * in comes back to the same screen.
 */
export function HeaderActions({ business, children }: { business?: string; children?: ReactNode }) {
  const { isSignedIn } = useAuth();
  const notifications = useNotifications({ enabled: isSignedIn });
  const unread = notifications.data?.unreadCount ?? 0;
  const { isWide } = useLayout();
  const current = useOptionalBusinessContext()?.business;
  // The slug Bo opens for, when it's this business's header and Bo is offered.
  const bo = business && current?.slug === business && current.assistantAvailable ? business : null;
  if (!isSignedIn) {
    return (
      <View style={styles.row}>
        {children}
        <Button
          variant="ghost"
          size="sm"
          label="Sign in"
          onPress={() => router.push("/sign-in")}
          testID="header-sign-in"
        />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {children}
      {bo ? (
        <IconButton
          icon={Sparkles}
          accessibilityLabel={`Ask ${ASSISTANT_NAME}`}
          color="brand"
          // The side panel on large screens, the modal on phones.
          onPress={() => openAssistant(bo, isWide)}
          testID="header-assistant"
        />
      ) : null}
      <IconButton
        icon={Bell}
        accessibilityLabel="Notifications"
        badge={unread}
        onPress={() => router.push("/notifications")}
        testID="header-notifications"
      />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center" } });
