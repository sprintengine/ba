/**
 * A proposal's card, whoever made it (an AI app, Bo): what it would change and what it affects, its warnings, and
 * Approve / Decline while it waits; then what was done (with links to see it) or why it didn't go ahead. The
 * website's `components/assistant/proposal-card.tsx`.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ArrowRight, CircleAlert, CircleCheck, CircleSlash, Clock, TriangleAlert } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import type { AssistantAction, AssistantActionStatus } from "@shared/api/types";
import { Badge, Button, Card, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { Callout } from "~/features/bookings/parts";

export const PROPOSAL_STATUS: Record<
  AssistantActionStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  pending: { label: "Needs your OK", tone: "info" },
  confirmed: { label: "Done", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  failed: { label: "Didn't work", tone: "danger" },
};

/** Approving or declining: a mutation keyed by the action id. */
export type Decide = {
  mutate: (id: string, options: { onError: (err: unknown) => void; onSuccess?: () => void }) => void;
  isPending: boolean;
};

export function ProposalView({
  action,
  confirm,
  reject,
  retryHint,
  formatTime,
  onLink,
  canDecide = true,
  onDecided,
}: {
  action: AssistantAction;
  confirm: Decide;
  reject: Decide;
  /** After a failure: who to ask to try again. */
  retryHint: string;
  /** A time in the business's timezone ("until 10:15"). */
  formatTime: (iso: string) => string;
  /** Opens a result link (`calendar?date=…`, or a full URL). */
  onLink: (path: string) => void;
  /** False shows it without the buttons (it can no longer go ahead). */
  canDecide?: boolean;
  /** After Approve or Decline went through ("approved" / "declined"). */
  onDecided?: (outcome: "approved" | "declined") => void;
}) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const p = action.proposal;
  const pending = action.status === "pending";
  const status = PROPOSAL_STATUS[action.status];

  const run = (m: Decide, outcome: "approved" | "declined") => {
    setError(null);
    m.mutate(action.id, {
      onError: (err) => setError(errorMessage(err)),
      onSuccess: () => onDecided?.(outcome),
    });
  };

  return (
    <Card
      testID={`proposal-${action.id}`}
      accent={pending}
      style={pending ? { borderColor: p.destructive ? colors.danger : colors.brand } : null}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text variant="headline" accessibilityRole="header">
              {p.title}
            </Text>
            <Text variant="callout" tone="muted">
              {p.summary}
            </Text>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        {p.changes.length > 0 ? (
          <View style={styles.changes} testID="proposal-changes">
            {p.changes.map((c) => (
              <View
                key={c.label}
                style={styles.change}
                accessible
                accessibilityLabel={
                  c.before != null && c.after != null
                    ? `${c.label}: ${c.before} to ${c.after}`
                    : c.after != null
                      ? `${c.label}: ${c.after}`
                      : `${c.label}: ${c.before ?? ""} removed`
                }
              >
                <Text variant="callout" tone="muted" style={styles.changeLabel}>
                  {c.label}
                </Text>
                <View style={styles.changeValue}>
                  {c.before != null ? (
                    <Text variant="callout" tone="subtle" style={styles.struck}>
                      {c.before}
                    </Text>
                  ) : null}
                  {c.before != null && c.after != null ? (
                    <Icon icon={ArrowRight} size={14} color="subtleForeground" />
                  ) : null}
                  {c.after != null ? (
                    <Text variant="callout" weight="medium">
                      {c.after}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {p.items.length > 0 ? (
          <View
            style={[styles.items, { borderColor: colors.borderSubtle }]}
            accessibilityLabel="Affected"
            testID="proposal-items"
          >
            {p.items.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.item,
                  i > 0
                    ? { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}
              >
                <Text variant="callout" weight="medium">
                  {item.title}
                </Text>
                {item.detail ? (
                  <Text variant="footnote" tone="muted">
                    {item.detail}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {pending && p.warnings.length > 0 ? (
          <Callout tone="warning" icon={TriangleAlert}>
            {p.warnings.join("\n")}
          </Callout>
        ) : null}

        {pending && canDecide ? (
          <View style={styles.decide}>
            <View style={styles.buttons}>
              <Button
                testID="approve-request"
                label={p.confirmLabel}
                variant={p.destructive ? "destructive" : "primary"}
                loading={confirm.isPending}
                disabled={reject.isPending}
                onPress={() => run(confirm, "approved")}
              />
              <Button
                testID="decline-request"
                label="Decline"
                variant="ghost"
                loading={reject.isPending}
                disabled={confirm.isPending}
                onPress={() => run(reject, "declined")}
              />
            </View>
            <View style={styles.until}>
              <Icon icon={Clock} size={12} color="subtleForeground" />
              <Text variant="footnote" tone="subtle" numeric>
                until {formatTime(action.expiresAt)}
              </Text>
            </View>
          </View>
        ) : null}

        {action.status === "confirmed" && action.result ? (
          <View
            style={[styles.result, { backgroundColor: colors.successSoft }]}
            accessibilityRole="summary"
            testID="proposal-result"
          >
            <View style={styles.row}>
              <Icon icon={CircleCheck} size={16} color="successSoftForeground" />
              <Text variant="callout" style={[styles.flex, { color: colors.successSoftForeground }]}>
                {action.result.message}
              </Text>
            </View>
            {action.result.links.length > 0 ? (
              <View style={styles.links}>
                {action.result.links.map((l) => (
                  <Button
                    key={l.path}
                    label={l.label}
                    variant="secondary"
                    size="sm"
                    onPress={() => onLink(l.path)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {action.status === "failed" ? (
          <Callout tone="danger" icon={CircleAlert} testID="proposal-failed">
            {`${action.error ?? "This couldn't be completed."} ${retryHint}`}
          </Callout>
        ) : null}
        {action.status === "expired" ? (
          <ClosedNote icon={Clock}>
            This proposal expired before it was confirmed, so nothing changed.
          </ClosedNote>
        ) : null}
        {action.status === "rejected" ? (
          <ClosedNote icon={CircleSlash}>Declined. Nothing changed.</ClosedNote>
        ) : null}

        {error ? (
          <Text variant="callout" tone="danger" accessibilityLiveRegion="polite" testID="proposal-error">
            {error}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function ClosedNote({ icon, children }: { icon: typeof Clock; children: string }) {
  return (
    <View style={styles.row}>
      <Icon icon={icon} size={16} color="mutedForeground" />
      <Text variant="callout" tone="muted" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  flex: { flex: 1 },
  changes: { gap: space[1.5] },
  change: { flexDirection: "row", gap: space[3] },
  changeLabel: { minWidth: space[16] },
  changeValue: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1.5] },
  struck: { textDecorationLine: "line-through" },
  items: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  item: { paddingHorizontal: space[3], paddingVertical: space[2] },
  decide: { gap: space[2] },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  until: { flexDirection: "row", alignItems: "center", gap: space[1] },
  result: { gap: space[2], padding: space[3], borderRadius: radius.lg },
  row: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
