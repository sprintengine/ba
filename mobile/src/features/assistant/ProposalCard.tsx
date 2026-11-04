/**
 * A proposal (Bo's, architecture §17.3): every change and affected item, with Confirm and Decline. Nothing happens
 * until Confirm; the card then shows what was done, or why it failed, with links to see it. Same semantics as the
 * website's `ProposalView`.
 */
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { ArrowRight, CircleAlert, CircleCheck, CircleSlash, Clock, TriangleAlert } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useConfirmAction, useRejectAction } from "@shared/api/hooks/use-assistant";
import type { AssistantAction, AssistantActionStatus } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { dashboardHref } from "@shared/dashboard/nav";
import { formatTime } from "@shared/format";
import type { Tone } from "@shared/status";
import { Badge, Button, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

export const PROPOSAL_STATUS: Record<AssistantActionStatus, { label: string; tone: Tone }> = {
  pending: { label: "Needs your OK", tone: "info" },
  confirmed: { label: "Done", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  failed: { label: "Didn't work", tone: "danger" },
};

type Decide = {
  mutate: (id: string, options: { onError: (err: unknown) => void }) => void;
  isPending: boolean;
};

/** Bo's proposal in the chat: confirm and decline through Bo's own endpoints. */
export function ProposalCard({
  action,
  onUpdated,
  onNavigate,
}: {
  action: AssistantAction;
  onUpdated: (a: AssistantAction) => void;
  onNavigate: (href: string) => void;
}) {
  const business = useCurrentBusiness();
  const confirm = useConfirmAction(business.id, {
    onSuccess: (a) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (a.result) AccessibilityInfo.announceForAccessibility(a.result.message);
      onUpdated(a);
    },
  });
  const reject = useRejectAction(business.id, {
    onSuccess: (a) => {
      AccessibilityInfo.announceForAccessibility("Declined. Nothing changed.");
      onUpdated(a);
    },
  });
  return (
    <ProposalView
      action={action}
      confirm={confirm}
      reject={reject}
      timezone={business.timezone}
      locale={business.locale}
      onLink={(path) => onNavigate(dashboardHref(business.slug, path))}
    />
  );
}

export function ProposalView({
  action,
  confirm,
  reject,
  timezone,
  locale,
  onLink,
  retryHint = "Ask Bo to try again.",
}: {
  action: AssistantAction;
  confirm: Decide;
  reject: Decide;
  timezone: string;
  locale?: string;
  onLink: (path: string) => void;
  retryHint?: string;
}) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const p = action.proposal;
  const pending = action.status === "pending";
  const status = PROPOSAL_STATUS[action.status];

  const run = (m: Decide) => {
    setError(null);
    m.mutate(action.id, {
      onError: (err) => {
        const message = errorMessage(err);
        setError(message);
        AccessibilityInfo.announceForAccessibility(message);
      },
    });
  };

  return (
    <View
      testID={`proposal-${action.id}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: pending ? (p.destructive ? colors.danger : colors.brandBorder) : colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
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
        <View style={styles.changes}>
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
                  <Text variant="callout" tone="subtle" style={{ textDecorationLine: "line-through" }}>
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
          accessibilityRole="list"
        >
          {p.items.map((item, i) => (
            <View
              key={i}
              style={[styles.item, i > 0 ? { borderTopColor: colors.borderSubtle, borderTopWidth: 1 } : null]}
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
        <View style={styles.warnings}>
          {p.warnings.map((w) => (
            <View key={w} style={styles.row}>
              <Icon icon={TriangleAlert} size={14} color="warningSoftForeground" />
              <Text variant="footnote" tone="warning" style={styles.flex}>
                {w}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {pending ? (
        <View style={styles.actions}>
          <Button
            size="sm"
            label={p.confirmLabel}
            variant={p.destructive ? "destructive" : "primary"}
            loading={confirm.isPending}
            disabled={reject.isPending}
            onPress={() => run(confirm)}
            testID={`proposal-confirm-${action.id}`}
          />
          <Button
            size="sm"
            label="Decline"
            variant="ghost"
            loading={reject.isPending}
            disabled={confirm.isPending}
            onPress={() => run(reject)}
            testID={`proposal-decline-${action.id}`}
          />
          <View style={[styles.row, styles.expiry]}>
            <Icon icon={Clock} size={12} color="subtleForeground" />
            <Text variant="footnote" tone="subtle" numeric>
              until {formatTime(action.expiresAt, timezone, locale)}
            </Text>
          </View>
        </View>
      ) : null}

      {action.status === "confirmed" && action.result ? (
        <View
          style={[styles.result, { backgroundColor: colors.successSoft }]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.row}>
            <Icon icon={CircleCheck} size={16} color="successSoftForeground" />
            <Text variant="callout" tone="success" style={styles.flex}>
              {action.result.message}
            </Text>
          </View>
          {action.result.links.length > 0 ? (
            <View style={styles.links}>
              {action.result.links.map((l) => (
                <Button
                  key={l.path}
                  size="sm"
                  variant="ghost"
                  label={l.label}
                  onPress={() => onLink(l.path)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {action.status === "failed" ? (
        <View style={styles.row}>
          <Icon icon={CircleAlert} size={16} color="danger" />
          <Text variant="callout" tone="danger" style={styles.flex}>
            {action.error ?? "This couldn't be completed."} {retryHint}
          </Text>
        </View>
      ) : null}
      {action.status === "expired" ? (
        <View style={styles.row}>
          <Icon icon={Clock} size={16} color="mutedForeground" />
          <Text variant="callout" tone="muted" style={styles.flex}>
            This proposal expired before it was confirmed, so nothing changed.
          </Text>
        </View>
      ) : null}
      {action.status === "rejected" ? (
        <View style={styles.row}>
          <Icon icon={CircleSlash} size={16} color="mutedForeground" />
          <Text variant="callout" tone="muted" style={styles.flex}>
            Declined. Nothing changed.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text variant="callout" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: space[3], gap: space[3] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  headerText: { flex: 1, gap: space[0.5] },
  changes: { gap: space[1.5] },
  change: { flexDirection: "row", gap: space[3] },
  changeLabel: { minWidth: 88 },
  changeValue: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1.5] },
  items: { borderWidth: 1, borderRadius: radius.lg },
  item: { paddingHorizontal: space[3], paddingVertical: space[2] },
  warnings: { gap: space[1] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[1.5] },
  flex: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  expiry: { marginLeft: "auto", alignItems: "center" },
  result: { borderRadius: radius.lg, paddingHorizontal: space[3], paddingVertical: space[2], gap: space[1] },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[1] },
});
