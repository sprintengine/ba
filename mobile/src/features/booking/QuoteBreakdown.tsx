import { StyleSheet, View } from "react-native";
import type { Quote } from "@shared/booking/quote";
import { formatDuration, formatMoney, formatPrice } from "@shared/format";
import { wasNowText } from "@shared/offers/display";
import { Divider, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { DealBadge, DealPrice, savingText } from "./deals";

/**
 * A quote's lines, the deal, the total and, for a deposit, what is due now (the website's QuoteBreakdown). `summary`:
 * the booking summary (the total shows the length, a deposit only what is due now); `review`: the review step (a
 * deposit also shows what is left to pay at the appointment).
 */
export function QuoteBreakdown({
  quote,
  currency,
  locale,
  variant,
}: {
  quote: Quote;
  currency: string;
  locale: string;
  variant: "summary" | "review";
}) {
  const summary = variant === "summary";
  const money = (cents: number) => formatMoney(cents, currency, { locale });
  return (
    <View style={styles.root} testID={`quote-${variant}`}>
      {quote.lines.map((line, i) => (
        <Row
          key={i}
          label={line.label}
          value={formatPrice(line.cents, currency, { locale })}
          accessibilityLabel={`${line.label}: ${formatPrice(line.cents, currency, { locale })}`}
        />
      ))}
      {quote.deal ? (
        <View
          style={styles.row}
          accessible
          accessibilityLabel={`${quote.deal.label}, ${quote.deal.name}: saving ${money(quote.deal.discountCents)}`}
        >
          <View style={styles.dealName}>
            <DealBadge label={quote.deal.label} />
            <Text variant="callout" tone="muted" numberOfLines={1} style={styles.flex}>
              {quote.deal.name}
            </Text>
          </View>
          <Text variant="callout" weight="medium" tone="brand" numeric>
            {savingText(quote.deal.discountCents, currency, locale)}
          </Text>
        </View>
      ) : null}
      <Divider />
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`Total${summary ? `, ${formatDuration(quote.durationMinutes)}` : ""}: ${
          quote.deal
            ? wasNowText(quote.deal.originalTotalCents, quote.totalCents, currency, locale)
            : formatPrice(quote.totalCents, currency, { locale })
        }`}
      >
        <Text variant="callout" weight="semibold">
          Total
          {summary ? (
            <Text variant="callout" tone="muted">
              {" "}
              · {formatDuration(quote.durationMinutes)}
            </Text>
          ) : null}
        </Text>
        {quote.deal ? (
          <DealPrice
            originalCents={quote.deal.originalTotalCents}
            priceCents={quote.totalCents}
            currency={currency}
            locale={locale}
          />
        ) : (
          <Text variant={summary ? "headline" : "callout"} weight="semibold" numeric>
            {formatPrice(quote.totalCents, currency, { locale })}
          </Text>
        )}
      </View>
      {quote.mode === "deposit" ? (
        summary ? (
          <Row label="Due now" value={money(quote.dueNowCents)} strong />
        ) : (
          <>
            <Row label="Deposit due now" value={money(quote.dueNowCents)} strong />
            <Row label="At your appointment" value={money(quote.dueLaterCents)} />
          </>
        )
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}>
      <Text variant="callout" tone="muted" style={styles.flex}>
        {label}
      </Text>
      <Text variant="callout" weight={strong ? "semibold" : "regular"} numeric>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[1.5] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
  dealName: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flexShrink: 1 },
});
