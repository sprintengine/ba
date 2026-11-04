import { StyleSheet, View } from "react-native";
import { PlugZap, Sparkles } from "lucide-react-native";
import { creditsTone, formatCredits } from "@shared/ai/credits";
import type { AiCredits } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useCurrentBusiness, usePermissions } from "@shared/business/business-context";
import { dashboardHref } from "@shared/dashboard/nav";
import { formatDate } from "@shared/format";
import { Button, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/**
 * "Running low" / "used up" notice for Bo (the website's `CreditsNotice`). Nothing while there are plenty of credits.
 * Owners get a way to their usage and plans.
 */
export function CreditsNotice({
  credits,
  onNavigate,
}: {
  credits: AiCredits;
  onNavigate: (href: string) => void;
}) {
  const business = useCurrentBusiness();
  const { manageBilling } = usePermissions();
  const { colors } = useTheme();
  const tone = creditsTone(credits);
  if (tone === "ok") return null;
  const resets = formatDate(credits.resetsOn, business.timezone, "dayMonth", business.locale);
  const out = tone === "out";
  return (
    <View
      testID="credits-notice"
      accessibilityRole="summary"
      style={[styles.box, { backgroundColor: out ? colors.dangerSoft : colors.warningSoft }]}
    >
      <View style={styles.row}>
        <Icon icon={Sparkles} size={16} color={out ? "dangerSoftForeground" : "warningSoftForeground"} />
        <Text variant="callout" tone={out ? "danger" : "warning"} style={styles.flex}>
          {out
            ? `This month's AI credits are used up. They reset on ${resets}.`
            : `Running low on AI credits: ${formatCredits(credits.remaining, business.locale)} left until ${resets}.`}
        </Text>
      </View>
      {manageBilling ? (
        <Button
          size="sm"
          variant="ghost"
          label={out ? "See plans" : "See usage"}
          onPress={() => onNavigate(dashboardHref(business.slug, "settings/billing"))}
        />
      ) : null}
    </View>
  );
}

/** Shown instead of a chat when no AI model is connected (no fake answers: architecture §17.1). */
export function NotConfigured() {
  const { colors } = useTheme();
  return (
    <View testID="assistant-not-configured" style={[styles.box, { backgroundColor: colors.surfaceSunken }]}>
      <View style={styles.row}>
        <Icon icon={PlugZap} size={16} color="subtleForeground" />
        <View style={styles.flex}>
          <Text variant="callout" weight="medium">
            AI isn&apos;t configured on this server
          </Text>
          <Text variant="callout" tone="muted">
            {ASSISTANT_NAME} can&apos;t answer questions until an AI model is connected. Your nudges and
            shortcuts still work.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.xl, paddingHorizontal: space[3], paddingVertical: space[2.5], gap: space[1] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[2.5] },
  flex: { flex: 1 },
});
