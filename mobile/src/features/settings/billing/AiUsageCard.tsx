import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import type { AiUsage } from "@shared/api/types";
import { useAiUsage } from "@shared/api/hooks/use-ai";
import { aiCreditUses, creditsPercent, creditsTone, formatCredits } from "@shared/ai/credits";
import { useBusinessContext } from "@shared/business/business-context";
import { formatDate } from "@shared/format";
import { Banner, Button, Divider, ErrorState, Section, Skeleton, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { Meter } from "./Meter";

/** Days shown before "Show every day". */
const RECENT_DAYS = 7;

/**
 * Settings › Billing's AI credits (the website's AiUsageCard): this month's allowance as a meter, what used it, and
 * credits per day as a list (the website's chart is left out: its table view says the same). Not shown where nothing on
 * this deployment draws on them (`aiCreditUses`).
 */
export function AiUsageCard() {
  const { business } = useBusinessContext();
  const uses = aiCreditUses(business);
  return uses ? <AiUsageSection uses={uses} /> : null;
}

function AiUsageSection({ uses }: { uses: string }) {
  const { business } = useBusinessContext();
  const usage = useAiUsage(business.id);
  const u = usage.data;
  return (
    <Section
      title="AI credits"
      description={`One monthly allowance for ${uses}. Each AI request uses credits in line with the model work it takes; unused credits don't roll over.`}
      testID="ai-usage"
    >
      {usage.isError && !u ? (
        <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      ) : !u ? (
        <View accessible accessibilityLabel="Loading AI credits">
          <Skeleton height={160} radius="lg" />
        </View>
      ) : (
        <Usage usage={u} />
      )}
    </Section>
  );
}

function Usage({ usage: u }: { usage: AiUsage }) {
  const { business } = useBusinessContext();
  const fmt = (n: number) => formatCredits(n, business.locale);
  const c = u.credits;
  const tone = creditsTone(c);
  const resets = formatDate(c.resetsOn, business.timezone, "dayMonth", business.locale);
  return (
    <>
      <View style={styles.meter}>
        <Meter
          testID="ai-credits-meter"
          label="AI credits this month"
          value={`${fmt(c.used)} / ${fmt(c.limit)}`}
          used={c.used}
          limit={c.limit}
          percent={creditsPercent(c)}
          tone={tone}
          valueText={`${fmt(c.remaining)} credits left`}
        />
        <Text variant="footnote" tone="muted">
          {fmt(c.remaining)} left · resets {resets}
          {c.overage ? " · usage past the allowance is billed" : ""}
        </Text>
      </View>
      {tone === "ok" ? null : (
        // The website's CreditsNotice, without its "See plans" link (the app doesn't sell plans).
        <Banner tone={tone === "out" ? "danger" : "warning"} icon={Sparkles} testID="ai-credits-notice">
          {tone === "out"
            ? `This month's AI credits are used up. They reset on ${resets}.`
            : `Running low on AI credits: ${fmt(c.remaining)} left until ${resets}.`}
        </Banner>
      )}
      {u.model.configured ? null : (
        <Text variant="callout" tone="muted">
          No AI model is connected on this server, so AI features use the free built-in helpers.
        </Text>
      )}
      <FeatureBreakdown usage={u} />
      <Daily usage={u} />
    </>
  );
}

function FeatureBreakdown({ usage }: { usage: AiUsage }) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const rows = usage.byFeature.filter((f) => f.requests > 0).sort((a, b) => b.credits - a.credits);
  const max = Math.max(0.01, ...rows.map((r) => r.credits));
  if (rows.length === 0) {
    return (
      <Text variant="callout" tone="subtle">
        No AI used yet this month.
      </Text>
    );
  }
  return (
    <View style={styles.features} accessibilityRole="list" accessibilityLabel="Credits by feature">
      {rows.map((r) => {
        const credits = formatCredits(r.credits, business.locale);
        const requests = `${r.requests} ${r.requests === 1 ? "request" : "requests"}`;
        return (
          <View
            key={r.feature}
            style={styles.feature}
            accessible
            accessibilityLabel={`${r.label}: ${credits} credits, ${requests}`}
            testID={`ai-feature-${r.feature}`}
          >
            <View style={styles.featureRow}>
              <Text variant="callout" weight="medium" numberOfLines={1} style={styles.featureName}>
                {r.label}
              </Text>
              <Text variant="footnote" tone="muted" numeric>
                {credits} credits · {requests}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View
                style={[styles.bar, { width: `${(r.credits / max) * 100}%`, backgroundColor: colors.brand }]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Credits per day, newest first (the website's table view); the last week until asked for every day. */
function Daily({ usage }: { usage: AiUsage }) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const days = [...usage.daily].reverse();
  const shown = all ? days : days.slice(0, RECENT_DAYS);
  if (days.length === 0) return null;
  return (
    <View style={styles.daily}>
      <Text variant="headline">Credits per day</Text>
      <View
        style={[styles.table, { borderColor: colors.border }]}
        accessibilityRole="list"
        accessibilityLabel="Credits per day"
      >
        {shown.map((d, i) => {
          const date = formatDate(d.date, business.timezone, "dayMonthYear", business.locale);
          const credits = formatCredits(d.credits, business.locale);
          return (
            <View key={d.date}>
              {i > 0 ? <Divider /> : null}
              <View
                style={styles.day}
                accessible
                accessibilityLabel={`${date}: ${credits} credits`}
                testID={`ai-day-${d.date}`}
              >
                <Text variant="callout">{date}</Text>
                <Text variant="callout" numeric>
                  {credits}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {days.length > RECENT_DAYS ? (
        <Button
          variant="ghost"
          size="sm"
          label={all ? "Show the last week" : "Show every day"}
          onPress={() => setAll((x) => !x)}
          testID="ai-days-toggle"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { gap: space[1.5] },
  features: { gap: space[3] },
  feature: { gap: space[1.5] },
  featureRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space[3],
  },
  featureName: { flexShrink: 1 },
  track: { height: space[2], borderRadius: radius.full, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.full },
  daily: { gap: space[2] },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  day: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
