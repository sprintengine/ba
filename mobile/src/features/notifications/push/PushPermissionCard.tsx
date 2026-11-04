import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BellRing } from "lucide-react-native";
import { prefs } from "~/lib/storage";
import { Button, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { usePushPermission } from "./usePushPermission";

const PREF_DISMISSED = "push.cardDismissedAt";
/** "Not now" hides the card for this long. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Asks for notifications at a moment that explains them (the inbox, the notifications page), never at launch: what
 * they'd get, then the system prompt on Turn on. When they were refused, says how to turn them on in Settings.
 * `always` shows it even after "Not now" (the notifications page).
 */
export function PushPermissionCard({ always = false }: { always?: boolean }) {
  const { colors } = useTheme();
  const { permission, turnOn, openSettings } = usePushPermission();
  const [snoozed, setSnoozed] = useState(
    () => Date.now() - (prefs().getNumber(PREF_DISMISSED) ?? 0) < DISMISS_MS,
  );
  const [asking, setAsking] = useState(false);
  if (permission === null || permission === "granted") return null;
  if (!always && snoozed) return null;

  const denied = permission === "denied";
  return (
    <View
      testID="push-permission-card"
      style={[styles.card, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}
    >
      <View style={styles.row}>
        <Icon icon={BellRing} size={20} color="brandSoftForeground" />
        <View style={styles.flex}>
          <Text variant="callout" weight="semibold">
            {denied ? "Notifications are off" : "Get notified on this device"}
          </Text>
          <Text variant="callout" tone="muted">
            {denied
              ? "Turn them on for bookanything in Settings to hear when something needs you, like a change your AI assistant wants you to approve."
              : "Know straight away when something needs you: a change your AI assistant wants you to approve, and for your business, new bookings, cancellations and moves."}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {denied ? (
          <Button size="sm" label="Open Settings" onPress={openSettings} />
        ) : (
          <Button
            size="sm"
            label="Turn on"
            loading={asking}
            testID="push-turn-on"
            onPress={() => {
              setAsking(true);
              void turnOn().finally(() => setAsking(false));
            }}
          />
        )}
        {always ? null : (
          <Button
            size="sm"
            variant="ghost"
            label="Not now"
            onPress={() => {
              prefs().set(PREF_DISMISSED, Date.now());
              setSnoozed(true);
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: space[3], gap: space[3] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  flex: { flex: 1, gap: space[0.5] },
  actions: { flexDirection: "row", gap: space[2], paddingLeft: space[8] },
});
