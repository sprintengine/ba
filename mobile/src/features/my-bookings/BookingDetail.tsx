import { StyleSheet, View } from "react-native";
import { Clock, Mail, MapPin, Phone, UserRound } from "lucide-react-native";
import type { CustomerBooking } from "@shared/api/types";
import { balanceDueCents, bookingMinutes, formatAddress, showsPaymentStatus } from "@shared/booking/booking";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPrice,
  formatTimeRange,
} from "@shared/format";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@shared/status";
import { callNumber, openMaps, sendEmail } from "~/lib/links";
import { Badge, BrandScope, BusinessAvatar, Card, Divider, ListRow, ScreenScroll, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { BookingActions } from "./BookingActions";

/**
 * One of my bookings: what, when, with whom, where, what it cost, how to reach the business, and what can be done
 * (pay while held, add to the calendar, reschedule, cancel, book again).
 */
export function BookingDetail({ booking: b }: { booking: CustomerBooking }) {
  return (
    <BrandScope color={b.business.branding.primaryColor}>
      <ScreenScroll testID="booking-detail">
        <Summary booking={b} />
        <WhenAndWhere booking={b} />
        <Payment booking={b} />
        <Contact booking={b} />
        <BookingActions booking={b} />
      </ScreenScroll>
    </BrandScope>
  );
}

function Summary({ booking: b }: { booking: CustomerBooking }) {
  const status = BOOKING_STATUS[b.status];
  const payment = showsPaymentStatus(b) ? PAYMENT_STATUS[b.paymentStatus] : null;
  return (
    <Card accent>
      <View style={styles.business}>
        <BusinessAvatar
          name={b.business.name}
          logoUrl={b.business.branding.logoUrl}
          color={b.business.branding.primaryColor}
          size={40}
        />
        <Text variant="callout" tone="muted" style={styles.flex}>
          {b.business.name}
        </Text>
      </View>
      <Text variant="title2" style={styles.title}>
        {b.service.name}
      </Text>
      {b.option || b.addons.length ? (
        <Text variant="callout" tone="muted">
          {[b.option?.name, ...b.addons.map((a) => `+ ${a.name}`)].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} />
        {payment ? <Badge label={payment.label} tone={payment.tone} /> : null}
      </View>
      <Text variant="footnote" tone="subtle" selectable style={styles.reference}>
        Reference {b.reference}
      </Text>
    </Card>
  );
}

function WhenAndWhere({ booking: b }: { booking: CustomerBooking }) {
  const tz = b.timezone;
  const address = formatAddress(b.business.address);
  const people = b.resources.map((r) => r.name).join(", ");
  return (
    <Card padding={0}>
      <ListRow
        icon={Clock}
        title={formatDate(b.start, tz, "full")}
        subtitle={`${formatTimeRange(b.start, b.end, tz)} (${formatDuration(bookingMinutes(b))}) · ${tz}`}
      />
      {people ? (
        <>
          <Divider inset={space[12]} />
          <ListRow icon={UserRound} title={people} subtitle="With" />
        </>
      ) : null}
      {address ? (
        <>
          <Divider inset={space[12]} />
          <ListRow
            icon={MapPin}
            title={address}
            subtitle="Directions"
            accessibilityHint="Opens maps"
            onPress={() => void openMaps(`${b.business.name}, ${address}`)}
          />
        </>
      ) : null}
    </Card>
  );
}

function Payment({ booking: b }: { booking: CustomerBooking }) {
  const balance = balanceDueCents(b);
  const rows: [string, string][] = [["Price", formatPrice(b.priceCents, b.currency)]];
  if (b.depositCents !== null) rows.push(["Deposit", formatMoney(b.depositCents, b.currency)]);
  if (b.amountPaidCents > 0) rows.push(["Paid online", formatMoney(b.amountPaidCents, b.currency)]);
  if (b.amountPaidInPersonCents > 0)
    rows.push(["Paid in person", formatMoney(b.amountPaidInPersonCents, b.currency)]);
  if (b.amountRefundedCents > 0) rows.push(["Refunded", formatMoney(b.amountRefundedCents, b.currency)]);
  if (balance !== null) rows.push(["Due at your appointment", formatMoney(balance, b.currency)]);
  return (
    <Card>
      <View style={styles.sectionTitle}>
        <Text variant="headline">Payment</Text>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.money} accessible accessibilityLabel={`${label}: ${value}`}>
          <Text variant="callout" tone="muted">
            {label}
          </Text>
          <Text variant="callout" weight="semibold" numeric>
            {value}
          </Text>
        </View>
      ))}
      {b.status === "held" && b.holdExpiresAt ? (
        <Text variant="callout" tone="warning" style={styles.note}>
          Held until {formatDateTime(b.holdExpiresAt, b.timezone)}. Pay to confirm it.
        </Text>
      ) : null}
      {b.refundPreview && b.canCancel ? (
        <Text variant="footnote" tone="subtle" style={styles.note}>
          {b.refundPreview.reason}
        </Text>
      ) : null}
    </Card>
  );
}

function Contact({ booking: b }: { booking: CustomerBooking }) {
  const { contactPhone: phone, contactEmail: email } = b.business;
  if (!phone && !email) return null;
  return (
    <Card padding={0}>
      {phone ? (
        <ListRow
          icon={Phone}
          title={phone}
          subtitle={`Call ${b.business.name}`}
          onPress={() => void callNumber(phone)}
        />
      ) : null}
      {phone && email ? <Divider inset={space[12]} /> : null}
      {email ? (
        <ListRow icon={Mail} title={email} subtitle="Email" onPress={() => void sendEmail(email)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  business: { flexDirection: "row", alignItems: "center", gap: space[3] },
  flex: { flex: 1 },
  title: { marginTop: space[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5], marginTop: space[3] },
  reference: { marginTop: space[3] },
  sectionTitle: { marginBottom: space[2] },
  money: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space[1] },
  note: { marginTop: space[2] },
});
