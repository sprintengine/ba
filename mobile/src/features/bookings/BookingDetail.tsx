import { router, type Href } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { CalendarClock, Eye, EyeOff, Lock, Mail, MessageSquare, Phone, Timer, X } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import { useUpdateBooking } from "@shared/api/hooks/use-bookings";
import type { BookingDetail as Detail } from "@shared/api/types";
import { bookingMinutes } from "@shared/booking/booking";
import { useCurrentBusiness } from "@shared/business/business-context";
import { auditActionLabel, auditActorLabel, auditDetail, SOURCE_LABEL } from "@shared/dashboard/booking-copy";
import { formatDuration } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  ListRow,
  ScreenScroll,
  Text,
  TextField,
  useTheme,
  useToast,
} from "~/ui";
import { radius, space } from "~/ui/tokens";
import { callNumber, sendEmail } from "~/lib/links";
import { logError } from "~/lib/logger";
import { BookingActionBar } from "./BookingActionBar";
import { useFmt } from "./fmt";
import { Callout, ColorDot, PersonAvatar, SectionTitle, StatusBadges } from "./parts";
import { PaymentLinkCard, PaymentSection } from "./PaymentSection";

/** Text the customer (the Messages app). */
export function sendMessage(phone: string) {
  return Linking.openURL(`sms:${phone.replace(/[^\d+]/g, "")}`).catch((e: unknown) =>
    logError(e, { link: "sms" }),
  );
}

/**
 * Everything about a booking, top to bottom (the website's drawer): who and when with its statuses, what needs doing
 * (actions), status notes, the customer and how to reach them, the service, payment, answers, notes and history.
 */
export function BookingDetail({
  booking: b,
  refreshing,
  onRefresh,
}: {
  booking: Detail;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScreenScroll
      testID="booking-detail"
      keyboardShouldPersistTaps="handled"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <Header booking={b} />
      <BookingActionBar key={b.id} booking={b} />
      <StatusCallouts booking={b} />
      {b.status === "held" && b.checkoutUrl ? (
        <PaymentLinkCard booking={b} checkoutUrl={b.checkoutUrl} />
      ) : null}
      <CustomerSection booking={b} />
      <ServiceSection booking={b} />
      <PaymentSection booking={b} />
      {b.answers.length > 0 ? <Answers booking={b} /> : null}
      <CustomerNote notes={b.customerNotes} />
      <InternalNotes key={`${b.id}-notes`} booking={b} />
      <History booking={b} />
    </ScreenScroll>
  );
}

function Header({ booking: b }: { booking: Detail }) {
  const fmt = useFmt();
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <PersonAvatar name={b.customer.name} size={48} />
        <View style={styles.flex}>
          <Text variant="title2" numberOfLines={2}>
            {b.customer.name}
          </Text>
          <Text variant="callout" tone="muted" numeric>
            {fmt.date(b.start, "dayMonthYear")} · {fmt.range(b.start, b.end)}
          </Text>
        </View>
      </View>
      <StatusBadges status={b.status} payment={b.paymentStatus} />
      <Text variant="footnote" tone="subtle" selectable accessibilityHint="Long press to copy">
        Reference {b.reference}
      </Text>
    </View>
  );
}

/** Held for payment, needs approval, or cancelled (by whom, when, why). */
function StatusCallouts({ booking: b }: { booking: Detail }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <>
      {b.status === "held" && b.holdExpiresAt ? (
        <Callout tone="warning" icon={Timer}>
          {`Waiting for payment. The slot is held until ${fmt.time(b.holdExpiresAt)}.`}
        </Callout>
      ) : null}
      {b.status === "pending_approval" ? (
        <Callout tone="info" icon={CalendarClock} testID="needs-approval">
          {`This ${v("booking")} needs your approval. The ${v("customer")} is told once you approve or decline.`}
        </Callout>
      ) : null}
      {b.status === "cancelled" ? (
        <Callout tone="danger" icon={X}>
          {`Cancelled${b.cancelledBy ? ` by the ${b.cancelledBy === "customer" ? v("customer") : b.cancelledBy}` : ""}${
            b.cancelledAt ? ` on ${fmt.dateTime(b.cancelledAt)}` : ""
          }.${b.cancellationReason ? ` “${b.cancellationReason}”` : ""}`}
        </Callout>
      ) : null}
    </>
  );
}

/** Name and group, and how to reach them: call, message, email. "View profile" opens the customer. */
function CustomerSection({ booking: b }: { booking: Detail }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const group = groups.data?.find((g) => g.id === (b.groupId ?? b.customer.groupId));
  const { phone, email } = b.customer;
  return (
    <View>
      <SectionTitle
        title={v("customer", { title: true })}
        action={
          <Button
            testID="view-profile"
            label="View profile"
            variant="ghost"
            size="sm"
            onPress={() => router.navigate(`/dashboard/${business.slug}/customers/${b.customer.id}` as Href)}
          />
        }
      />
      <Card padding={0}>
        <View style={styles.customer}>
          <Text weight="semibold">{b.customer.name}</Text>
          {group ? <Badge label={group.name} tone="brand" /> : null}
        </View>
        {phone ? (
          <>
            <Divider />
            <ListRow icon={Phone} title={phone} subtitle="Call" onPress={() => void callNumber(phone)} />
            <Divider inset={space[12]} />
            <ListRow
              icon={MessageSquare}
              title={phone}
              subtitle="Message"
              onPress={() => void sendMessage(phone)}
            />
          </>
        ) : null}
        {email ? (
          <>
            <Divider inset={phone ? space[12] : 0} />
            <ListRow icon={Mail} title={email} subtitle="Email" onPress={() => void sendEmail(email)} />
          </>
        ) : null}
        {!phone && !email ? (
          <>
            <Divider />
            <View style={styles.padded}>
              <Text variant="callout" tone="muted">
                No contact details
              </Text>
            </View>
          </>
        ) : null}
      </Card>
    </View>
  );
}

/** Service and option, length, add-ons, resources, buffers, and where it was booked. */
function ServiceSection({ booking: b }: { booking: Detail }) {
  const fmt = useFmt();
  const buffers =
    b.bufferBeforeMinutes > 0 || b.bufferAfterMinutes > 0
      ? `Blocks ${[
          b.bufferBeforeMinutes > 0 ? `${b.bufferBeforeMinutes} min before` : "",
          b.bufferAfterMinutes > 0 ? `${b.bufferAfterMinutes} min after` : "",
        ]
          .filter(Boolean)
          .join(" and ")} for preparation.`
      : null;
  return (
    <View>
      <SectionTitle title="Service" />
      <Card>
        <View style={styles.row}>
          <ColorDot color={b.service.color} />
          <Text weight="semibold" style={styles.flex}>
            {b.service.name}
            {b.option ? <Text tone="muted">{` · ${b.option.name}`}</Text> : null}
          </Text>
          <Text variant="callout" tone="muted" numeric>
            {formatDuration(bookingMinutes(b))}
          </Text>
        </View>
        {b.addons.map((a) => (
          <View key={a.id} style={[styles.row, styles.line]}>
            <Text variant="callout" tone="muted" style={styles.flex}>
              + {a.name}
              {a.extraMinutes ? ` (${formatDuration(a.extraMinutes)})` : ""}
            </Text>
            <Text variant="callout" tone="muted" numeric>
              {a.priceCents ? fmt.money(a.priceCents, { signed: true }) : ""}
            </Text>
          </View>
        ))}
        {b.resources.length > 0 ? (
          <View style={[styles.wrap, styles.line]}>
            {b.resources.map((r) => (
              <Badge key={r.id} label={r.name} />
            ))}
          </View>
        ) : null}
        {buffers ? (
          <Text variant="footnote" tone="subtle" style={styles.line}>
            {buffers}
          </Text>
        ) : null}
      </Card>
      <Text variant="footnote" tone="subtle" style={styles.after}>
        Booked via {SOURCE_LABEL[b.source].toLowerCase()} on {fmt.dateTime(b.createdAt)}
      </Text>
    </View>
  );
}

/** Answers to the booking questions; sensitive ones stay hidden until shown. */
function Answers({ booking: b }: { booking: Detail }) {
  return (
    <View>
      <SectionTitle title="Answers" />
      <Card>
        <View style={styles.answers}>
          {b.answers.map((a) => (
            <Answer key={a.questionId} label={a.label} value={a.value} sensitive={a.sensitive} />
          ))}
        </View>
      </Card>
    </View>
  );
}

function Answer({ label, value, sensitive }: { label: string; value: string; sensitive: boolean }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(!sensitive);
  return (
    <View style={sensitive ? [styles.sensitive, { backgroundColor: colors.warningSoft }] : null}>
      <View style={styles.row}>
        <Text variant="callout" tone="muted" style={styles.flex}>
          {label}
        </Text>
        {sensitive ? (
          <View style={styles.row}>
            <Icon icon={Lock} size={14} color="warningSoftForeground" />
            <Text variant="footnote" tone="warning">
              Sensitive
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        {shown ? (
          <Text style={styles.flex} selectable>
            {value || "—"}
          </Text>
        ) : (
          <Text style={styles.flex} tone="subtle" accessibilityLabel="Hidden">
            ••••••••••
          </Text>
        )}
        {sensitive ? (
          <IconButton
            icon={shown ? EyeOff : Eye}
            accessibilityLabel={shown ? `Hide answer: ${label}` : `Show answer: ${label}`}
            onPress={() => setShown((s) => !s)}
            size={18}
          />
        ) : null}
      </View>
      {sensitive ? (
        <Text variant="footnote" tone="warning">
          Never emailed or shared with AI.
        </Text>
      ) : null}
    </View>
  );
}

function CustomerNote({ notes }: { notes: string | null }) {
  const { v } = useVocabulary();
  const { colors } = useTheme();
  if (!notes) return null;
  return (
    <View>
      <SectionTitle title={`Note from the ${v("customer")}`} />
      <View
        style={[
          styles.quote,
          { backgroundColor: colors.surfaceSunken, borderLeftColor: colors.borderStrong },
        ]}
      >
        <Text variant="callout">{notes}</Text>
      </View>
    </View>
  );
}

/** Team-only notes: edit in place; Save or Discard once changed. */
function InternalNotes({ booking }: { booking: Detail }) {
  const business = useCurrentBusiness();
  const toast = useToast();
  const update = useUpdateBooking(business.id);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? booking.internalNotes ?? "";
  const dirty = draft !== null && draft !== (booking.internalNotes ?? "");
  const save = async () => {
    try {
      await update.mutateAsync({ id: booking.id, input: { internalNotes: value.trim() ? value : null } });
      toast.show("Notes saved");
      setDraft(null);
    } catch (err) {
      toast.show(errorMessage(err), "danger");
    }
  };
  return (
    <View>
      <SectionTitle title="Internal notes" />
      <TextField
        testID="internal-notes"
        label="Internal notes"
        hint="Only your team can see these notes."
        value={value}
        onChangeText={setDraft}
        multiline
      />
      {dirty ? (
        <View style={styles.noteActions}>
          <Button label="Discard" variant="ghost" size="sm" onPress={() => setDraft(null)} />
          <Button
            testID="save-notes"
            label="Save notes"
            size="sm"
            loading={update.isPending}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The audit trail, newest first. */
function History({ booking }: { booking: Detail }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const { colors } = useTheme();
  const events = [...booking.history].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (events.length === 0) return null;
  return (
    <View testID="booking-history">
      <SectionTitle title="History" />
      <View style={styles.history}>
        {events.map((e, i) => {
          const detail = auditDetail(e, booking.currency, fmt.dateTime);
          return (
            <View key={e.id} style={styles.event} accessible>
              <View
                style={[styles.dot, { backgroundColor: i === 0 ? colors.brand : colors.borderStrong }]}
                accessibilityElementsHidden
              />
              <View style={styles.flex}>
                <Text variant="callout" weight="medium">
                  {auditActionLabel(e.action, v)}
                </Text>
                <Text variant="footnote" tone="muted">
                  {auditActorLabel(e, v)} · {fmt.dateTime(e.occurredAt)}
                </Text>
                {detail ? (
                  <Text variant="footnote" tone="muted">
                    {detail}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  line: { marginTop: space[2.5] },
  after: { marginTop: space[2] },
  customer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space[2],
    padding: space[4],
  },
  padded: { padding: space[4] },
  answers: { gap: space[3] },
  sensitive: { padding: space[3], borderRadius: radius.lg, gap: space[1] },
  quote: { padding: space[3], borderRadius: radius.md, borderLeftWidth: space[0.5] },
  noteActions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2], marginTop: space[2] },
  history: { gap: space[4] },
  event: { flexDirection: "row", gap: space[3] },
  dot: { width: space[2.5], height: space[2.5], borderRadius: radius.full, marginTop: space[1.5] },
});
