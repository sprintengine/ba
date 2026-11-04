import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, ChevronUp, Clock, Lock, Shield, User, Users, Zap } from "lucide-react-native";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { cancellationSummary, paymentModeCopy } from "@shared/booking/copy";
import type { Quote } from "@shared/booking/quote";
import { chosenExtras, resourceChoiceName, type Selection } from "@shared/booking/selection";
import type { StepId } from "@shared/booking/steps";
import { formatDate, formatPrice, formatTime, zonedToIso } from "@shared/format";
import { Card, Divider, Icon, type IconComponent, Sheet, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { QuoteBreakdown } from "./QuoteBreakdown";

export type SummaryProps = {
  business: PublicBusiness;
  service: PublicService | null;
  selection: Selection;
  quote: Quote | null;
  steps: StepId[];
  onEdit?: (step: StepId) => void;
  /** Any bookable service is paid online. */
  takesOnlinePayment?: boolean;
  resourceNoun: string;
  bookingNoun: string;
};

type Row = { step: StepId; icon: IconComponent; label: string; hint?: string };

function summaryRows({ business, service, selection, steps, resourceNoun }: SummaryProps): Row[] {
  const tz = business.timezone;
  const group = business.customerGroups.find((g) => g.id === selection.groupId);
  const { option, addons } = chosenExtras(service, selection);
  const resource = resourceChoiceName(selection, service, resourceNoun);
  const rows: Row[] = [];
  if (steps.includes("group") && group) rows.push({ step: "group", icon: Users, label: group.name });
  if (service)
    rows.push({
      step: "service",
      icon: Clock,
      label: option ? `${service.name} · ${option.name}` : service.name,
      hint: addons.length > 0 ? `+ ${addons.map((a) => a.name).join(", ")}` : undefined,
    });
  if (steps.includes("resource") && resource) rows.push({ step: "resource", icon: User, label: resource });
  if (selection.date && selection.time)
    rows.push({
      step: "time",
      icon: CalendarDays,
      label: formatDate(selection.date, tz, "long", business.locale),
      hint: formatTime(zonedToIso(selection.date, selection.time, tz), tz, business.locale),
    });
  return rows;
}

/** The booking so far, with Change on each row, the price and the policies (beside the steps on iPad). */
export function BookingSummaryCard(props: SummaryProps) {
  const { colors } = useTheme();
  const { business, service, quote, onEdit, steps, takesOnlinePayment, bookingNoun } = props;
  const rows = summaryRows(props);
  return (
    <Card padding={0} testID="booking-summary">
      <View style={styles.cardHeader}>
        <Text variant="footnote" tone="subtle">
          Your {bookingNoun}
        </Text>
        <Text variant="headline" numberOfLines={1}>
          {business.name}
        </Text>
      </View>
      <Divider />
      {rows.length === 0 ? (
        <View style={styles.intro}>
          <Text variant="callout" tone="muted">
            Choose a service to get started.
          </Text>
          <Assurance icon={Zap}>Live availability, confirmed by email</Assurance>
          <Assurance icon={Shield}>
            {business.policies.allowCustomerCancel
              ? `Change or cancel online${business.policies.cancellationNoticeHours > 0 ? ` up to ${business.policies.cancellationNoticeHours}h before` : ""}`
              : `Your details are only shared with ${business.name}`}
          </Assurance>
          {business.paymentsEnabled && takesOnlinePayment ? (
            <Assurance icon={Lock}>Secure payments, straight to {business.name}</Assurance>
          ) : null}
        </View>
      ) : (
        <View style={styles.rows}>
          {rows.map((r) => {
            const editable = !!onEdit && steps.includes(r.step);
            const content = (
              <>
                <View style={[styles.rowIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon icon={r.icon} size={14} color="brandSoftForeground" />
                </View>
                <View style={styles.flex}>
                  <Text variant="callout" weight="medium">
                    {r.label}
                  </Text>
                  {r.hint ? (
                    <Text variant="footnote" tone="muted" numeric>
                      {r.hint}
                    </Text>
                  ) : null}
                </View>
                {editable ? (
                  <Text variant="footnote" tone="muted">
                    Change
                  </Text>
                ) : null}
              </>
            );
            return editable ? (
              <Pressable
                key={r.step}
                accessibilityRole="button"
                accessibilityLabel={`${r.label}${r.hint ? `, ${r.hint}` : ""}. Change`}
                onPress={() => onEdit(r.step)}
                style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
              >
                {content}
              </Pressable>
            ) : (
              <View key={r.step} style={styles.row}>
                {content}
              </View>
            );
          })}
        </View>
      )}
      {quote && service ? (
        <View
          style={[styles.price, { backgroundColor: colors.surfaceSunken, borderTopColor: colors.border }]}
        >
          <QuoteBreakdown
            quote={quote}
            currency={business.currency}
            locale={business.locale}
            variant="summary"
          />
          {paymentModeCopy(quote, business.currency, business.locale) ? (
            <Text variant="footnote" tone="muted">
              {paymentModeCopy(quote, business.currency, business.locale)}
            </Text>
          ) : null}
          <View style={styles.line}>
            <Icon icon={Shield} size={14} color="subtleForeground" />
            <Text variant="footnote" tone="muted" style={styles.flex}>
              {cancellationSummary(business.policies, quote.mode, business.name)}
            </Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function Assurance({ icon, children }: { icon: IconComponent; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Icon icon={icon} size={16} color="brand" />
      <Text variant="callout" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Phones: the running total and the step's action pinned to the bottom; the summary opens the full breakdown in a
 * sheet. `actionOnly` (the review step): just the action, full width.
 */
export function SummaryBar({
  action,
  actionOnly = false,
  ...props
}: SummaryProps & { action: ReactNode; actionOnly?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { business, service, quote, selection, bookingNoun } = props;
  if (!service && !action) return null;
  const tz = business.timezone;
  const when =
    selection.date && selection.time
      ? `${formatDate(selection.date, tz, "dayMonth", business.locale)}, ${formatTime(zonedToIso(selection.date, selection.time, tz), tz, business.locale)}`
      : null;
  return (
    <View
      testID="summary-bar"
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, space[3]),
        },
      ]}
    >
      {actionOnly ? (
        <View style={styles.flex}>{action}</View>
      ) : (
        <>
          {service && quote ? (
            <Pressable
              testID="summary-open"
              accessibilityRole="button"
              accessibilityLabel={`Show ${bookingNoun} summary: ${service.name}${when ? `, ${when}` : ""}, ${formatPrice(quote.totalCents, business.currency, { locale: business.locale })}`}
              onPress={() => setOpen(true)}
              style={styles.barSummary}
            >
              <View style={styles.flex}>
                <Text variant="callout" weight="medium" numberOfLines={1}>
                  {service.name}
                </Text>
                <Text variant="footnote" tone="muted" numberOfLines={1} numeric>
                  {[when, formatPrice(quote.totalCents, business.currency, { locale: business.locale })]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Icon icon={ChevronUp} size={16} color="subtleForeground" />
            </Pressable>
          ) : (
            <View style={styles.flex} />
          )}
          {action}
        </>
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title={`Your ${bookingNoun}`}>
        <BookingSummaryCard
          {...props}
          onEdit={
            props.onEdit
              ? (step) => {
                  setOpen(false);
                  props.onEdit?.(step);
                }
              : undefined
          }
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: { paddingHorizontal: space[4], paddingVertical: space[3] },
  intro: { padding: space[4], gap: space[3] },
  rows: { padding: space[1.5] },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[2.5],
    borderRadius: radius.lg,
  },
  rowIcon: {
    width: space[6] + space[1],
    height: space[6] + space[1],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  price: { padding: space[4], gap: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barSummary: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: MIN_TOUCH },
});
