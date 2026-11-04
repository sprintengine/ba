import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CircleAlert, CreditCard, Shield, Store } from "lucide-react-native";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { bookingEnd } from "@shared/booking/booking";
import { cancellationSummary, paymentModeCopy } from "@shared/booking/copy";
import { isAnswered, type DetailsValues, type Question } from "@shared/booking/details-schema";
import type { BookingAlert } from "@shared/booking/errors";
import type { Quote } from "@shared/booking/quote";
import { ANY_RESOURCE, chosenExtras, resourceChoiceName, type Selection } from "@shared/booking/selection";
import type { StepId } from "@shared/booking/steps";
import { formatDate, formatDuration, formatTimeRange, zonedToIso } from "@shared/format";
import { openWebsite } from "~/lib/links";
import { Badge, Card, Divider, Icon, Text, useTheme } from "~/ui";
import { MIN_TOUCH, space } from "~/ui/tokens";
import { Callout } from "./Callout";
import { ChoiceCard } from "./ChoiceCard";
import { QuoteBreakdown } from "./QuoteBreakdown";
import type { PaymentChoice } from "./use-booking-flow";

/** The last step: everything chosen, each with Change, the price breakdown, how to pay and the policies. */
export function ReviewStep({
  business,
  service,
  selection,
  quote,
  payment,
  details,
  questions,
  onEdit,
  alert,
  resourceNoun,
  bookingNoun,
}: {
  business: PublicBusiness;
  service: PublicService;
  selection: Selection;
  quote: Quote;
  payment: PaymentChoice;
  details: DetailsValues;
  questions: Question[];
  onEdit: (step: StepId) => void;
  alert: BookingAlert | null;
  resourceNoun: string;
  bookingNoun: string;
}) {
  const tz = business.timezone;
  const start = selection.date && selection.time ? zonedToIso(selection.date, selection.time, tz) : null;
  const { option, addons } = chosenExtras(service, selection);
  const resource = resourceChoiceName(selection, service, resourceNoun);
  const withWhom = resource && (selection.resource === ANY_RESOURCE ? resource : `With ${resource}`);
  const group = business.customerGroups.find((g) => g.id === selection.groupId);
  const answered = questions
    .filter((q) => isAnswered(q, details.answers[q.id]))
    .map((q) => ({ q, value: details.answers[q.id]?.trim() ?? "" }));
  const notes = details.notes.trim();
  const howToPay =
    quote.mode === "deposit" ? null : paymentModeCopy(quote, business.currency, business.locale);

  return (
    <View style={styles.root} testID="review-step">
      {alert ? (
        <Callout tone={alert.tone} title={alert.title} alert testID="booking-alert">
          {alert.body}
        </Callout>
      ) : null}
      {start && selection.date ? (
        <Section title="When" onEdit={() => onEdit("time")}>
          <Text variant="headline">{formatDate(selection.date, tz, "full", business.locale)}</Text>
          <Text variant="callout" tone="muted" numeric>
            {formatTimeRange(start, bookingEnd(start, quote.durationMinutes), tz, business.locale)} ·{" "}
            {formatDuration(quote.durationMinutes)}
          </Text>
        </Section>
      ) : null}
      <Section title="What" onEdit={() => onEdit("service")}>
        <Text variant="body" weight="medium">
          {service.name}
          {option ? <Text tone="muted"> · {option.name}</Text> : null}
        </Text>
        {addons.length > 0 ? (
          <Text variant="callout" tone="muted">
            + {addons.map((a) => a.name).join(", ")}
          </Text>
        ) : null}
        {withWhom || group ? (
          <Text variant="callout" tone="muted">
            {[withWhom, group?.name].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </Section>
      <Section title="Your details" onEdit={() => onEdit("details")}>
        <Text variant="body" weight="medium">
          {details.name}
        </Text>
        <Text variant="callout" tone="muted">
          {[details.email, details.phone].filter(Boolean).join(" · ")}
        </Text>
        {answered.length > 0 || notes ? (
          <View style={styles.answers}>
            <Divider />
            {answered.map(({ q, value }) => (
              <View key={q.id} style={styles.answer}>
                <View style={styles.answerLabel}>
                  <Text variant="footnote" tone="muted">
                    {q.label}
                  </Text>
                  {q.sensitive ? <Badge label="Private" /> : null}
                </View>
                <Text variant="callout">{q.kind === "checkbox" ? "Yes" : value}</Text>
              </View>
            ))}
            {notes ? (
              <View style={styles.answer}>
                <Text variant="footnote" tone="muted">
                  Notes
                </Text>
                <Text variant="callout">{notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>
      <Section title="Payment">
        {payment.offered ? (
          <View style={styles.howToPay} accessibilityRole="radiogroup" accessibilityLabel="How to pay">
            <ChoiceCard
              testID="pay-online"
              icon={CreditCard}
              title="Pay online now"
              description="Card, Apple Pay or Google Pay."
              selected={!payment.atVenue}
              onPress={() => payment.setAtVenue(false)}
            />
            <ChoiceCard
              testID="pay-at-venue"
              icon={Store}
              title="Pay at the venue"
              description="Nothing to pay now."
              selected={payment.atVenue}
              onPress={() => payment.setAtVenue(true)}
            />
          </View>
        ) : null}
        <QuoteBreakdown
          quote={quote}
          currency={business.currency}
          locale={business.locale}
          variant="review"
        />
        <View style={styles.policies}>
          <Divider />
          {howToPay ? <Line icon={CreditCard}>{howToPay}</Line> : null}
          <Line icon={Shield}>{cancellationSummary(business.policies, quote.mode, business.name)}</Line>
          {service.requiresApproval ? (
            <Line icon={CircleAlert}>
              {business.name} reviews each request. You'll get an email once it's confirmed.
            </Line>
          ) : null}
        </View>
      </Section>
      <Text variant="footnote" tone="muted">
        Your details are shared with {business.name} to manage your {bookingNoun}. See our{" "}
        <Text
          variant="footnote"
          tone="brand"
          accessibilityRole="link"
          onPress={() => void openWebsite("/legal/privacy")}
          suppressHighlighting
        >
          privacy notice
        </Text>
        .
      </Text>
    </View>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Card padding={4}>
      <View style={styles.sectionHeader}>
        <Text variant="footnote" tone="subtle" accessibilityRole="header">
          {title}
        </Text>
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change ${title.toLowerCase()}`}
            onPress={onEdit}
            hitSlop={space[2]}
            style={styles.change}
          >
            <Text variant="footnote" weight="semibold" style={{ color: colors.brand }}>
              Change
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function Line({ icon, children }: { icon: typeof Shield; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Icon icon={icon} size={16} color="subtleForeground" />
      <Text variant="callout" tone="muted" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: space[6],
  },
  change: { minHeight: MIN_TOUCH - space[3], justifyContent: "center", paddingHorizontal: space[1] },
  sectionBody: { gap: space[1] },
  answers: { gap: space[2.5], marginTop: space[2] },
  answer: { gap: space[0.5] },
  answerLabel: { flexDirection: "row", alignItems: "center", gap: space[2] },
  howToPay: { gap: space[2], marginBottom: space[3] },
  policies: { gap: space[2], marginTop: space[3] },
  line: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  flex: { flex: 1 },
});
