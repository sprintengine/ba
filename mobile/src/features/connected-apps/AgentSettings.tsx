import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useMyAgentSettings, useUpdateMyAgentSettings } from "@shared/api/hooks/use-notifications";
import type { CustomerAutoApprove } from "@shared/api/types";
import { Card, ErrorState, Skeleton, Switch, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";

export const AUTO_APPROVE_KINDS: { value: CustomerAutoApprove; label: string; description: string }[] = [
  {
    value: "bookings",
    label: "Booking and moving",
    description: "New bookings, and moving one to another time.",
  },
  {
    value: "cancellations",
    label: "Cancelling",
    description: "Cancelling a booking, with the refund the business's policy gives.",
  },
];

/** The kinds on after turning one on or off (in the order above). */
export function nextAutoApprove(
  current: CustomerAutoApprove[],
  kind: CustomerAutoApprove,
  on: boolean,
): CustomerAutoApprove[] {
  const set = new Set(current);
  return AUTO_APPROVE_KINDS.map((k) => k.value).filter((k) => (k === kind ? on : set.has(k)));
}

/**
 * "What your AI apps can do without asking" (the website's AgentSettingsCard, §20.9): an AI app can only prepare a
 * booking, a move or a cancellation; it goes ahead once approved here. The person may let some kinds go ahead once
 * they say yes in the app instead. Nothing by default.
 */
export function AgentSettings() {
  const toast = useToast();
  const settings = useMyAgentSettings();
  const update = useUpdateMyAgentSettings();
  const on = settings.data?.autoApprove ?? [];
  const toggle = (kind: CustomerAutoApprove, value: boolean) =>
    update.mutate(nextAutoApprove(on, kind, value), {
      onSuccess: () => toast.show("Saved"),
      onError: (err) => toast.show(errorMessage(err), "danger"),
    });
  return (
    <Card testID="agent-settings">
      <Text variant="headline" accessibilityRole="header">
        What your AI apps can do without asking
      </Text>
      <Text variant="callout" tone="muted" style={styles.description}>
        An AI app can only prepare a booking, a move or a cancellation. It goes ahead once you approve it on
        bookanything: the app gives you a link, and it's under{" "}
        <Text
          variant="callout"
          tone="brand"
          accessibilityRole="link"
          onPress={() => router.navigate("/my/approvals")}
        >
          Approvals
        </Text>
        . Turn on what an app may do once you say yes in the app instead.
      </Text>
      <View style={styles.list}>
        {settings.isError && !settings.data ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : !settings.data ? (
          <Skeleton height={72} />
        ) : (
          AUTO_APPROVE_KINDS.map((k) => (
            <Switch
              key={k.value}
              testID={`auto-approve-${k.value}`}
              label={k.label}
              description={k.description}
              value={on.includes(k.value)}
              disabled={update.isPending}
              onValueChange={(value) => toggle(k.value, value)}
            />
          ))
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  description: { marginTop: space[1] },
  list: { gap: space[2], marginTop: space[3] },
});
