import { Share, StyleSheet, View } from "react-native";
import { Link2, Share2, Timer } from "lucide-react-native";
import type { CreatedBooking } from "@shared/api/types";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Icon, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { logError } from "~/lib/logger";
import { useFmt } from "../fmt";
import { Callout } from "../parts";

/** A booking waiting for online payment was created: the link to share, and the way on. */
export function HeldForPayment({
  booking,
  checkoutUrl,
  emailed,
  onView,
  onDone,
}: {
  booking: CreatedBooking;
  checkoutUrl: string;
  emailed: boolean;
  onView: () => void;
  onDone: () => void;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const amount = booking.depositCents
    ? ` the ${fmt.money(booking.depositCents, { currency: booking.currency })} deposit`
    : ` ${fmt.money(booking.priceCents, { currency: booking.currency })}`;
  return (
    <View style={styles.root} testID="held-for-payment">
      <Text variant="callout" tone="muted">
        {booking.customer.name} · {booking.service.name} · {fmt.date(booking.start, "dayMonth")},{" "}
        {fmt.time(booking.start)}
      </Text>
      {booking.holdExpiresAt ? (
        <Callout tone="warning" icon={Timer}>
          {`The time is held until ${fmt.time(booking.holdExpiresAt)}. It's confirmed as soon as the ${v("customer")} pays${amount}; after that the time is released.`}
        </Callout>
      ) : null}
      <View style={styles.row}>
        <Icon icon={Link2} size={18} color="subtleForeground" />
        <Text weight="medium">Payment link</Text>
      </View>
      <Text variant="footnote" tone="muted" selectable numberOfLines={2}>
        {checkoutUrl}
      </Text>
      <Text variant="callout" tone="muted">
        {emailed
          ? `We've emailed this link to ${booking.customer.email}. You can also share it another way.`
          : `Share the link with the ${v("customer")} by text or email.`}
      </Text>
      <Button
        label="Share payment link"
        icon={Share2}
        variant="secondary"
        onPress={() =>
          void Share.share({ message: checkoutUrl, url: checkoutUrl }).catch((e: unknown) => logError(e))
        }
      />
      <View style={styles.actions}>
        <Button label={`View ${v("booking")}`} variant="secondary" onPress={onView} />
        <Button label="Done" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  actions: { flexDirection: "row", gap: space[2], justifyContent: "flex-end", marginTop: space[2] },
});
