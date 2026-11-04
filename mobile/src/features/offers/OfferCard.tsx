import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Pause, Play, Trash2 } from "lucide-react-native";
import type { Offer, Service } from "@shared/api/types";
import { useDeleteOffer, usePauseOffer, useResumeOffer } from "@shared/api/hooks/use-offers";
import { useBusinessContext } from "@shared/business/business-context";
import { OFFER_KIND_LABEL, OFFER_STATE, offerState, redemptionsText } from "@shared/offers/display";
import { Badge, Button, IconButton, Text, useTheme } from "~/ui";
import { confirmAction, useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { useBusinessFormat } from "../reports/format";
import { DealBadge } from "./DealPrice";
import { offerCardLabel, serviceNames, validDates } from "./offers";

export type OfferCardProps = {
  offer: Offer;
  services: Service[];
  /** `YYYY-MM-DD` in the business timezone. */
  today: string;
  onEdit: (offer: Offer) => void;
  /** After it's deleted (the split view lets go of it). */
  onDeleted?: (offer: Offer) => void;
  /** Open beside the list (iPad). */
  selected?: boolean;
};

/** One deal in the Offers list (the website's OfferCard): what, when, how much it's used; pause and delete. */
export const OfferCard = memo(function OfferCard({
  offer,
  services,
  today,
  onEdit,
  onDeleted,
  selected,
}: OfferCardProps) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const fmt = useBusinessFormat();
  const feedback = useSaveFeedback();
  const pause = usePauseOffer(business.id);
  const resume = useResumeOffer(business.id);
  const remove = useDeleteOffer(business.id);
  const state = OFFER_STATE[offerState(offer, today)];
  const paused = offer.status === "paused";
  const date = (d: string) => fmt.date(d, "medium");
  const dates = validDates(offer, date);

  const toggle = () =>
    void (paused
      ? feedback.run(() => resume.mutateAsync(offer.id), `${offer.name} resumed`)
      : feedback.run(() => pause.mutateAsync(offer.id), `${offer.name} paused`));

  const del = async () => {
    const ok = await confirmAction({
      title: `Delete ${offer.name}?`,
      message: "It stops applying straight away. Bookings that already have the deal keep their price.",
      confirmLabel: "Delete offer",
      destructive: true,
    });
    if (!ok) return;
    if (await feedback.run(() => remove.mutateAsync(offer.id), `${offer.name} deleted`)) onDeleted?.(offer);
  };

  return (
    <View
      testID={`offer-${offer.id}`}
      style={[styles.root, selected ? { backgroundColor: colors.accent } : null]}
    >
      <Pressable
        testID={`offer-open-${offer.id}`}
        accessibilityRole="button"
        accessibilityLabel={offerCardLabel({ offer, services, today, date })}
        accessibilityHint="Edits the offer"
        accessibilityState={{ selected: !!selected }}
        onPress={() => onEdit(offer)}
        style={({ pressed }) => [styles.main, pressed ? { opacity: 0.7 } : null]}
      >
        <Text variant="headline" numberOfLines={2}>
          {offer.name}
        </Text>
        <View style={styles.badges}>
          <DealBadge label={offer.label} />
          <Badge label={state.label} tone={state.tone} />
        </View>
        <Text variant="callout" tone="muted">
          {OFFER_KIND_LABEL[offer.kind]} · {offer.summary}
        </Text>
        <Text variant="footnote" tone="subtle" numeric>
          {[
            serviceNames(offer.serviceIds, services),
            redemptionsText(offer.redemptions, offer.maxRedemptions),
            dates,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Button
          testID={`offer-toggle-${offer.id}`}
          size="sm"
          variant="secondary"
          icon={paused ? Play : Pause}
          label={paused ? "Resume" : "Pause"}
          accessibilityLabel={`${paused ? "Resume" : "Pause"} ${offer.name}`}
          loading={pause.isPending || resume.isPending}
          onPress={toggle}
        />
        <IconButton
          testID={`offer-delete-${offer.id}`}
          icon={Trash2}
          size={20}
          color="danger"
          accessibilityLabel={`Delete ${offer.name}`}
          disabled={remove.isPending}
          onPress={() => void del()}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { padding: space[4], gap: space[3] },
  main: { gap: space[1.5] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space[1] },
});
