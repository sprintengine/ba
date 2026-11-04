import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ArrowRight,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Clock,
  TriangleAlert,
  Unplug,
} from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useApproveMyAgentRequest, useDeclineMyAgentRequest } from "@shared/api/hooks/use-notifications";
import { qk } from "@shared/api/query-keys";
import type { AssistantActionStatus, CustomerAgentRequest } from "@shared/api/types";
import { formatDateTime, formatTime } from "@shared/format";
import type { Tone } from "@shared/status";
import { Badge, Button, Card, Icon, Text, useTheme, useToast } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { followLink } from "./links";

export const REQUEST_STATUS: Record<AssistantActionStatus, { label: string; tone: Tone }> = {
  pending: { label: "Needs your OK", tone: "info" },
  confirmed: { label: "Done", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  failed: { label: "Didn't work", tone: "danger" },
};

/**
 * One of the customer's AI apps' requests (the website's CustomerRequestCard + ProposalView): what it would do, from
 * which app, with Approve and Decline. Approving books, moves or cancels here, signed in: the app can't do that
 * itself. Afterwards: what happened, with links (Pay now, Your bookings).
 */
export function RequestCard({ request }: { request: CustomerAgentRequest }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Refused because it changed since it was prepared (or can't go ahead): show it as it is now.
  const reload = () => void qc.invalidateQueries({ queryKey: qk.myAgentRequests() });
  const approve = useApproveMyAgentRequest({ onError: reload });
  const decline = useDeclineMyAgentRequest();
  const { action, app } = request;
  const p = action.proposal;
  const pending = action.status === "pending";
  const canDecide = !request.appDisconnected;
  const status = REQUEST_STATUS[action.status];

  const run = (m: typeof approve | typeof decline) => {
    setError(null);
    m.mutate(action.id, { onError: (err) => setError(errorMessage(err)) });
  };
  const open = async (path: string) => {
    try {
      if ((await followLink(path)) === "paid") reload();
    } catch (err) {
      toast.show(errorMessage(err), "danger");
    }
  };

  return (
    <View style={styles.root} testID={`request-${action.id}`}>
      <View style={styles.from}>
        <Icon icon={Bot} size={14} color="mutedForeground" />
        <Text variant="footnote" tone="muted">
          From {app} · {formatDateTime(action.createdAt, request.timezone)}
        </Text>
      </View>
      <Card
        style={
          pending
            ? {
                borderColor: p.destructive ? colors.danger : colors.brandBorder,
                borderWidth: borderWidth.focus,
              }
            : undefined
        }
      >
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
          <View style={styles.section}>
            {p.changes.map((c) => (
              <View key={c.label} style={styles.change} accessible accessibilityLabel={changeLabel(c)}>
                <Text variant="callout" tone="muted" style={styles.changeLabel}>
                  {c.label}
                </Text>
                <View style={styles.changeValue}>
                  {c.before != null && c.after != null ? (
                    <>
                      <Text variant="callout" tone="subtle" style={styles.struck}>
                        {c.before}
                      </Text>
                      <Icon icon={ArrowRight} size={14} color="subtleForeground" />
                      <Text variant="callout" weight="medium">
                        {c.after}
                      </Text>
                    </>
                  ) : c.after != null ? (
                    <Text variant="callout" weight="medium">
                      {c.after}
                    </Text>
                  ) : (
                    <Text variant="callout" tone="subtle" style={styles.struck}>
                      {c.before}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {p.items.length > 0 ? (
          <View style={[styles.items, { borderColor: colors.borderSubtle }]} accessibilityLabel="Affected">
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
          <View style={styles.section}>
            {p.warnings.map((w) => (
              <View key={w} style={styles.line}>
                <Icon icon={TriangleAlert} size={14} color="warningSoftForeground" />
                <Text variant="footnote" tone="warning" style={styles.flex}>
                  {w}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {pending && canDecide ? (
          <View style={styles.actions}>
            <Button
              testID="request-approve"
              variant={p.destructive ? "destructive" : "primary"}
              label={p.confirmLabel}
              loading={approve.isPending}
              disabled={decline.isPending}
              onPress={() => run(approve)}
            />
            <Button
              testID="request-decline"
              variant="ghost"
              label="Decline"
              loading={decline.isPending}
              disabled={approve.isPending}
              onPress={() => run(decline)}
            />
            <View style={styles.until}>
              <Icon icon={Clock} size={12} color="subtleForeground" />
              <Text variant="footnote" tone="subtle" numeric>
                until {formatTime(action.expiresAt, request.timezone)}
              </Text>
            </View>
          </View>
        ) : null}

        {action.status === "confirmed" && action.result ? (
          <View
            style={[styles.result, { backgroundColor: colors.successSoft }]}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.line}>
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
                    testID={`request-link-${l.label}`}
                    variant="secondary"
                    size="sm"
                    label={l.label}
                    onPress={() => void open(l.path)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {action.status === "failed" ? (
          <Note icon={CircleAlert} tone="danger">
            {`${action.error ?? "This couldn't be completed."} Ask ${app} to try again.`}
          </Note>
        ) : null}
        {action.status === "expired" ? (
          <Note icon={Clock}>This proposal expired before it was confirmed, so nothing changed.</Note>
        ) : null}
        {action.status === "rejected" ? <Note icon={CircleSlash}>Declined. Nothing changed.</Note> : null}
        {error ? (
          <Text variant="callout" tone="danger" accessibilityRole="alert" style={styles.gap}>
            {error}
          </Text>
        ) : null}
      </Card>
      {pending && request.appDisconnected ? (
        <Note icon={Unplug}>{`${app} was disconnected, so this can't go ahead.`}</Note>
      ) : null}
      {pending && !request.needsApproval && !request.appDisconnected ? (
        <Text variant="footnote" tone="muted">
          You let your AI apps make this kind of change, so {app} can also go ahead once you say yes there.
        </Text>
      ) : null}
      {action.status === "confirmed" ? (
        <Note icon={CircleCheck}>{`You can go back to ${app}: it can see that this went ahead.`}</Note>
      ) : null}
    </View>
  );
}

function changeLabel(c: { label: string; before: string | null; after: string | null }) {
  if (c.before != null && c.after != null) return `${c.label}: ${c.before} to ${c.after}`;
  if (c.after != null) return `${c.label}: ${c.after}`;
  return `${c.label}: ${c.before ?? ""} removed`;
}

function Note({ icon, tone, children }: { icon: typeof Clock; tone?: "danger"; children: string }) {
  return (
    <View style={[styles.line, styles.gap]}>
      <Icon icon={icon} size={16} color={tone === "danger" ? "dangerSoftForeground" : "mutedForeground"} />
      <Text variant="callout" tone={tone ?? "muted"} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[2] },
  from: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  flex: { flex: 1 },
  section: { gap: space[1.5], marginTop: space[3] },
  change: { flexDirection: "row", gap: space[3] },
  changeLabel: { minWidth: space[16] + space[4] },
  changeValue: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1.5] },
  struck: { textDecorationLine: "line-through" },
  items: { marginTop: space[3], borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  item: { paddingHorizontal: space[3], paddingVertical: space[2] },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space[1.5] },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space[2],
    marginTop: space[4],
  },
  until: { flexDirection: "row", alignItems: "center", gap: space[1], marginLeft: "auto" },
  result: { marginTop: space[3], padding: space[3], borderRadius: radius.lg, gap: space[2] },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  gap: { marginTop: space[3] },
});
