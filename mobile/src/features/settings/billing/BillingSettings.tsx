import { StyleSheet, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import type { BillingInfo } from "@shared/api/types";
import { useBilling } from "@shared/api/hooks/use-billing";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { Badge, ErrorState, Icon, Section, Skeleton, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { AiUsageCard } from "./AiUsageCard";
import { Meter } from "./Meter";
import { currentPlan, planStatus } from "./plans";

/**
 * Settings › Billing, read-only on purpose: the business's plan, its status, what it includes, this month's bookings
 * and AI credits.
 *
 * APP STORE / PLAY DECISION: the website's page also lists the other plans with prices and sends owners to Stripe
 * Checkout or the Stripe billing portal to subscribe or change plan. A subscription is a digital service, so Apple
 * (App Review Guidelines 3.1.1 and 3.1.3, anti-steering) and Google Play (payments policy) would require in-app
 * purchase for it, and forbid buttons, links or wording that send people to buy elsewhere. So the app has no
 * upgrade / subscribe / change-plan buttons, no other plans or prices, no Stripe Checkout or portal link (no
 * `useBillingCheckout` / `useBillingPortal`), and no pointer to the website; it only says plan changes aren't
 * available in the app.
 */
export function BillingSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const billing = useBilling(business.id, { enabled: perms.manageBilling });
  useRefetchOnFocus(billing.refetch);

  if (!perms.manageBilling) {
    // The website's message for non-owners.
    return (
      <SettingsPage segment="billing">
        <Section
          title="Only owners manage billing"
          description="Ask an owner of this business to change the plan or see invoices."
          testID="billing-owners-only"
        >
          <Text variant="callout" tone="muted">
            You&apos;re an admin, so you can manage everything else in Settings.
          </Text>
        </Section>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage segment="billing">
      {billing.isError && !billing.data ? (
        <ErrorState error={billing.error} onRetry={() => void billing.refetch()} />
      ) : billing.data ? (
        <>
          <PlanCard billing={billing.data} />
          <AiUsageCard />
        </>
      ) : (
        <View style={styles.loading} accessible accessibilityLabel="Loading billing" testID="billing-loading">
          <Skeleton height={112} radius="2xl" />
          <Skeleton height={256} radius="2xl" />
        </View>
      )}
    </SettingsPage>
  );
}

function PlanCard({ billing: b }: { billing: BillingInfo }) {
  const { v } = useVocabulary();
  const plan = currentPlan(b);
  const status = planStatus(b.status);
  const { bookingsThisMonth: used, limit } = b.usage;
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const label = `${v("bookings", { title: true })} this month`;
  return (
    <Section
      title={`Current plan: ${plan.name}`}
      description={
        b.plan === "free" ? "Free forever for small businesses." : "Thanks for supporting bookanything."
      }
      action={<Badge label={status.label} tone={status.tone} />}
      testID="billing-plan"
    >
      {status.text ? (
        <Text variant="callout" testID="billing-status">
          {status.text}
        </Text>
      ) : null}

      {limit !== null ? (
        <View style={styles.meter}>
          <Meter
            testID="billing-bookings-meter"
            label={label}
            value={`${used} / ${limit}`}
            used={used}
            limit={limit}
            percent={pct}
            tone={pct >= 90 ? "out" : pct >= 70 ? "low" : "ok"}
          />
          {pct >= 70 ? (
            <Text variant="footnote" tone="muted">
              {pct >= 100
                ? `Limit reached — new online ${v("bookings")} are paused until next month.`
                : "You're getting close to the free limit."}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text variant="callout" tone="muted" numeric>
          {used} {v("booking", { count: used })} this month · unlimited
        </Text>
      )}

      {plan.features.length > 0 ? (
        <View style={styles.features} accessibilityRole="list" accessibilityLabel="What your plan includes">
          <Text variant="headline">What your plan includes</Text>
          {plan.features.map((f) => (
            <View key={f} style={styles.feature} accessible accessibilityLabel={f}>
              <Icon icon={CircleCheck} size={16} color="success" />
              <Text variant="callout" tone="muted" style={styles.featureText}>
                {f}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text variant="footnote" tone="subtle" testID="billing-no-changes">
        Plan changes aren&apos;t available in the app.
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space[4] },
  meter: { gap: space[2] },
  features: { gap: space[2] },
  feature: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  featureText: { flex: 1 },
});
