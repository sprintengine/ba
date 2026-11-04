import { Alert, Share, StyleSheet, View } from "react-native";
import { HandCoins, Link2, Mail, Share2 } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useMarkPaidInPerson, useSendPaymentLink } from "@shared/api/hooks/use-bookings";
import type { BookingDetail } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { canMarkPaidInPerson } from "@shared/dashboard/booking-capabilities";
import { amountDue } from "@shared/dashboard/booking-copy";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Card, Divider, Icon, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { logError } from "~/lib/logger";
import { useFmt } from "./fmt";
import { haptics } from "./haptics";
import { SectionTitle } from "./parts";

function providerLabel(provider: string) {
  if (provider === "dev") return "test payment";
  if (provider === "in_person") return "in person";
  return provider;
}

/** Price (with any deal), deposit, paid, refunded, what's still due, then each payment; mark paid in person. */
export function PaymentSection({ booking: b }: { booking: BookingDetail }) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const toast = useToast();
  const mark = useMarkPaidInPerson(business.id);
  const due = amountDue(b);
  const money = (cents: number) => fmt.money(cents, { currency: b.currency });
  const rows: [string, string, boolean?][] = [];
  if (b.offer && b.originalPriceCents != null && b.originalPriceCents > b.priceCents) {
    rows.push([`Deal: ${b.offer.label}`, `was ${fmt.price(b.originalPriceCents, b.currency)}`]);
  }
  rows.push(["Price", fmt.price(b.priceCents, b.currency)]);
  if (b.depositCents !== null && b.depositCents > 0) rows.push(["Deposit", money(b.depositCents)]);
  if (b.amountPaidCents > 0) rows.push(["Paid", money(b.amountPaidCents)]);
  if (b.amountRefundedCents > 0) rows.push(["Refunded", `−${money(b.amountRefundedCents)}`]);
  if (due > 0 && b.paymentStatus !== "not_required") {
    rows.push([b.paymentStatus === "pay_at_venue" ? "Due at venue" : "Outstanding", money(due), true]);
  }

  const confirmPaid = () => {
    const amount = money(due);
    Alert.alert(
      `Mark ${amount} as paid in person?`,
      "Records that this was paid at the venue. It counts in your reports and can't be refunded online.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark as paid",
          onPress: () =>
            void mark.mutateAsync(b.id).then(
              () => {
                haptics.success();
                toast.show(`${amount} marked as paid in person`);
              },
              (err: unknown) => toast.show(errorMessage(err), "danger"),
            ),
        },
      ],
    );
  };

  return (
    <View testID="payment-section">
      <SectionTitle title="Payment" />
      <Card padding={0}>
        {rows.map(([label, value, strong], i) => (
          <View key={label}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
              <Text variant="callout" tone="muted">
                {label}
              </Text>
              <Text variant="callout" weight={strong ? "semibold" : "regular"} numeric>
                {value}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      {canMarkPaidInPerson(b) && due > 0 ? (
        <View style={styles.action}>
          <Button
            testID="mark-paid"
            label="Mark as paid in person"
            icon={HandCoins}
            variant="secondary"
            size="sm"
            loading={mark.isPending}
            onPress={confirmPaid}
          />
        </View>
      ) : null}
      {b.payments.length > 0 ? (
        <View style={styles.payments}>
          {b.payments.map((p) => (
            <View key={p.id} style={styles.payment} accessible>
              <Text variant="footnote" tone="muted" style={styles.flex}>
                {p.kind === "refund" ? "Refund" : "Charge"} · {providerLabel(p.provider)} · {p.status}
              </Text>
              <Text variant="footnote" tone="muted" numeric>
                {p.kind === "refund" ? "−" : ""}
                {fmt.money(p.amountCents, { currency: p.currency })} · {fmt.date(p.createdAt, "short")}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A held booking's checkout link: share it, or email it to the customer again. */
export function PaymentLinkCard({ booking, checkoutUrl }: { booking: BookingDetail; checkoutUrl: string }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const toast = useToast();
  const send = useSendPaymentLink(business.id);
  return (
    <Card testID="payment-link">
      <View style={styles.title}>
        <Icon icon={Link2} size={18} color="subtleForeground" />
        <Text weight="semibold">Payment link</Text>
      </View>
      <Text variant="callout" tone="muted">
        The {v("customer")} pays online with this link to confirm the {v("booking")}.
      </Text>
      <Text variant="footnote" tone="subtle" selectable numberOfLines={2} style={styles.url}>
        {checkoutUrl}
      </Text>
      <View style={styles.buttons}>
        <Button
          label="Share payment link"
          icon={Share2}
          variant="secondary"
          size="sm"
          onPress={() =>
            void Share.share({ message: checkoutUrl, url: checkoutUrl }).catch((e: unknown) => logError(e))
          }
        />
        {booking.customer.email ? (
          <Button
            testID="resend-payment-link"
            label="Resend payment link"
            icon={Mail}
            variant="ghost"
            size="sm"
            loading={send.isPending}
            onPress={() =>
              void send.mutateAsync(booking.id).then(
                (sent) => toast.show(`Payment link sent to ${sent.sentTo}`),
                (err: unknown) => toast.show(errorMessage(err), "danger"),
              )
            }
          />
        ) : (
          <Text variant="footnote" tone="subtle">
            No email address on file, so share the link directly.
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2.5],
  },
  action: { marginTop: space[3] },
  payments: { marginTop: space[3], gap: space[1.5] },
  payment: { flexDirection: "row", gap: space[2] },
  flex: { flex: 1 },
  title: { flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[1] },
  url: { marginTop: space[2] },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    marginTop: space[3],
    alignItems: "center",
  },
});
