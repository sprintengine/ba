import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Share, StyleSheet, View } from "react-native";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  Clock,
  CreditCard,
  Hourglass,
  Link as LinkIcon,
  MapPin,
  Share2,
  Undo2,
  UserRound,
} from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import {
  useCancelManagedBooking,
  useManagedBooking,
  usePayManagedBooking,
  usePublicBusiness,
} from "@shared/api/hooks/use-public";
import type { ManagedBooking } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import {
  amountDueCents,
  balanceDueCents,
  bookingMinutes,
  formatAddress,
  hasEnded,
  showsPaymentStatus,
} from "@shared/booking/booking";
import { formatCountdown } from "@shared/booking/copy";
import { manageHero, manageHeroText, type ManageHero } from "@shared/booking/manage";
import {
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTimeRange,
  toPlainDate,
} from "@shared/format";
import { useCountdown, useNow } from "@shared/hooks/use-now";
import { BOOKING_STATUS, isBlockingStatus, PAYMENT_STATUS } from "@shared/status";
import { vocab } from "@shared/vocabulary";
import { websiteUrl, callNumber, openMaps } from "~/lib/links";
import {
  Badge,
  BrandScope,
  Button,
  Card,
  DateTile,
  Divider,
  ErrorState,
  Icon,
  type IconComponent,
  ListRow,
  ScreenScroll,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from "~/ui";
import { radius, space } from "~/ui/tokens";
import { openCheckout } from "~/features/booking/checkout";
import { DealBadge, DealPrice } from "~/features/booking/deals";
import { addToCalendar } from "./calendar";
import { CancelSheet } from "./CancelSheet";
import { CHECKING_MS, contextFromOutcome, heroContext, POLL_MS, type ViewContext } from "./manage-context";
import { ManageRescheduleSheet } from "./Reschedule";

/**
 * A booking by its manage token (the website's manage page): what happened (booked, paid, held for payment…), the
 * booking, and what can be done with it: pay, add to the calendar, reschedule, cancel. Used by the manage link
 * (`/manage/[token]`, signed in or not) and by the booking flow once booked.
 */
export function ManageBookingView({ token, context }: { token: string; context: ViewContext }) {
  const [ctx, setCtx] = useState<ViewContext>(context);
  const [given, setGiven] = useState(context);
  if (given !== context) {
    setGiven(context);
    setCtx(context);
  }
  const booking = useManagedBooking(token, {
    // After a payment, read it again until the payment is confirmed (the webhook), or for a few seconds when the
    // browser closed without saying how it ended.
    refetchInterval: (q) =>
      q.state.data?.status === "held" && (ctx === "paid" || ctx === "checking") ? POLL_MS : false,
  });
  const status = booking.data?.status;
  if (ctx === "checking" && status && status !== "held") setCtx("paid");
  useEffect(() => {
    if (ctx !== "checking") return;
    const id = setTimeout(() => setCtx((c) => (c === "checking" ? "payment_cancelled" : c)), CHECKING_MS);
    return () => clearTimeout(id);
  }, [ctx]);

  if (booking.isError && !booking.data) {
    return booking.error.isNotFound ? (
      <ScreenScroll>
        <View style={styles.notFound} testID="manage-not-found">
          <Hero
            icon={LinkIcon}
            tone="neutral"
            title="This link isn't valid anymore"
            body="Manage links stop working after the appointment, or the link may be incomplete. Check the latest email from the business, or contact them directly."
          />
          <Button
            variant="secondary"
            label="See your bookings"
            onPress={() => router.navigate("/my/bookings")}
          />
        </View>
      </ScreenScroll>
    ) : (
      <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />
    );
  }
  if (!booking.data) {
    return (
      <ScreenScroll>
        <View
          style={styles.loading}
          accessible
          accessibilityLabel="Loading booking"
          accessibilityRole="progressbar"
        >
          <Skeleton height={96} radius="2xl" />
          <Skeleton height={260} radius="2xl" />
          <Skeleton height={96} radius="2xl" />
        </View>
      </ScreenScroll>
    );
  }
  return (
    <BrandScope color={booking.data.business.branding.primaryColor}>
      <Loaded
        token={token}
        booking={booking.data}
        context={ctx}
        setContext={setCtx}
        refreshing={booking.isRefetching}
        onRefresh={() => void booking.refetch()}
      />
    </BrandScope>
  );
}

function Loaded({
  token,
  booking: b,
  context,
  setContext,
  refreshing,
  onRefresh,
}: {
  token: string;
  booking: ManagedBooking;
  context: ViewContext;
  setContext: (c: ViewContext) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const { isLoaded, isSignedIn } = useAuth();
  const business = usePublicBusiness(b.business.slug, { retry: false, staleTime: 5 * 60_000 });
  const noun = vocab(business.data?.vocabulary, "booking");
  const remaining = useCountdown(b.status === "held" ? b.holdExpiresAt : null);
  const now = useNow();
  const active = isBlockingStatus(b.status) && !hasEnded(b, now);
  const [sheet, setSheet] = useState<"reschedule" | "cancel" | null>(null);
  const cancel = useCancelManagedBooking(token);
  const pay = usePayManagedBooking(token);
  const manageUrl = websiteUrl(`/manage/${token}`);

  const onPay = async () => {
    try {
      const { checkoutUrl } = await pay.mutateAsync();
      setContext("checkout");
      setContext(contextFromOutcome(await openCheckout(checkoutUrl, token)));
    } catch (err) {
      toast.show(errorMessage(err), "danger");
    }
  };

  const hero = manageHero(b, heroContext(context), remaining);
  return (
    <ScreenScroll testID="manage-booking" refreshing={refreshing} onRefresh={onRefresh}>
      <ManageHeroBanner
        hero={hero}
        booking={b}
        knowsBusiness={!!business.data}
        remaining={remaining}
        noun={noun}
        onPay={() => void onPay()}
        paying={pay.isPending}
      />
      <ManageBookingCard
        booking={b}
        noun={noun}
        active={active}
        manageUrl={manageUrl}
        onReschedule={() => setSheet("reschedule")}
        onCancel={() => setSheet("cancel")}
      />
      {active && (context === "booked" || context === "paid") ? (
        <SaveLinkCard url={manageUrl} noun={noun} />
      ) : null}
      {isLoaded && !isSignedIn ? (
        <Card testID="create-account">
          <Text variant="headline">
            Keep all your {vocab(business.data?.vocabulary, "bookings")} in one place
          </Text>
          <Text variant="callout" tone="muted" style={styles.gapTop}>
            Create a free account with {b.customer.email ?? "your email"} to see and manage everything you
            book.
          </Text>
          <View style={styles.gapTop}>
            <Button variant="secondary" label="Create account" onPress={() => router.push("/sign-in")} />
          </View>
        </Card>
      ) : null}
      <ManageRescheduleSheet
        token={token}
        booking={b}
        maxAdvanceDays={business.data?.policies.maxAdvanceDays ?? null}
        visible={sheet === "reschedule"}
        onClose={() => setSheet(null)}
      />
      <CancelSheet
        booking={b}
        bookingNoun={noun}
        visible={sheet === "cancel"}
        onClose={() => setSheet(null)}
        cancel={(reason) => cancel.mutateAsync({ reason })}
        successMessage={`Your ${noun} was cancelled`}
      />
    </ScreenScroll>
  );
}

type ShownHero = Exclude<ManageHero, { kind: "none" }>;

const HERO_ICONS: Record<ShownHero["kind"], IconComponent> = {
  confirmed: Check,
  pending_approval: Hourglass,
  confirming_payment: Clock,
  awaiting_payment: CreditCard,
  cancelled: CalendarX2,
  expired: Clock,
  past: Check,
};

/** The headline: what happened (or what to do next), with the matching action. */
export function ManageHeroBanner({
  hero,
  booking: b,
  knowsBusiness,
  remaining,
  noun,
  onPay,
  paying,
}: {
  hero: ManageHero;
  booking: ManagedBooking;
  knowsBusiness: boolean;
  remaining: number | null;
  noun: string;
  onPay: () => void;
  paying: boolean;
}) {
  if (hero.kind === "none") return null;
  const body =
    hero.kind === "awaiting_payment"
      ? remaining === null || remaining <= 0
        ? `Complete payment to confirm your ${noun}.`
        : `Your time is held for ${formatCountdown(remaining)}. Complete payment to confirm your ${noun}.`
      : manageHeroText(hero.kind, b, { noun, knowsBusiness });
  let action: ReactNode = null;
  switch (hero.kind) {
    case "awaiting_payment":
      action = (
        <Button
          testID="manage-pay"
          variant="primary"
          icon={CreditCard}
          loading={paying}
          label={`Pay ${formatMoney(amountDueCents(b), b.currency)}`}
          onPress={onPay}
        />
      );
      break;
    case "cancelled":
      action = (
        <Button
          variant="secondary"
          icon={Undo2}
          label="Book another time"
          onPress={() => bookAgain(b.business.slug)}
        />
      );
      break;
    case "expired":
    case "past":
      action = (
        <Button
          variant={hero.kind === "expired" ? "primary" : "secondary"}
          label="Book again"
          onPress={() => bookAgain(b.business.slug)}
        />
      );
      break;
    default:
      break;
  }
  return (
    <View testID={`manage-hero-${hero.kind}`}>
      <Hero icon={HERO_ICONS[hero.kind]} tone={hero.tone} title={hero.title} body={body}>
        {action}
      </Hero>
    </View>
  );
}

function bookAgain(slug: string) {
  router.push({ pathname: "/[slug]", params: { slug } });
}

function Hero({
  icon,
  tone,
  title,
  body,
  children,
}: {
  icon: IconComponent;
  tone: "success" | "info" | "warning" | "neutral";
  title: string;
  body?: string | null;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const look = {
    success: { bg: colors.successSoft, fg: "successSoftForeground" as const },
    info: { bg: colors.infoSoft, fg: "infoSoftForeground" as const },
    warning: { bg: colors.warningSoft, fg: "warningSoftForeground" as const },
    neutral: { bg: colors.muted, fg: "mutedForeground" as const },
  }[tone];
  return (
    <View style={styles.hero}>
      <View style={[styles.heroIcon, { backgroundColor: look.bg }]}>
        <Icon icon={icon} size={22} color={look.fg} strokeWidth={2.25} />
      </View>
      <View style={styles.heroText}>
        <Text variant="title2">{title}</Text>
        {body ? (
          <Text variant="body" tone="muted" numeric>
            {body}
          </Text>
        ) : null}
        {children ? <View style={styles.heroAction}>{children}</View> : null}
      </View>
    </View>
  );
}

/** The booking: what, when, with whom, price, where, reference, and what can be done. */
export function ManageBookingCard({
  booking: b,
  noun,
  active,
  manageUrl,
  onReschedule,
  onCancel,
}: {
  booking: ManagedBooking;
  noun: string;
  active: boolean;
  manageUrl: string | null;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const tz = b.timezone;
  const address = formatAddress(b.business.address);
  const status = BOOKING_STATUS[b.status];
  const payment = showsPaymentStatus(b) ? customerPaymentBadge(b) : null;
  return (
    <Card padding={0} testID="manage-card">
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <View style={styles.badges}>
            <Badge label={status.label} tone={status.tone} />
            {payment ? <Badge label={payment.label} tone={payment.tone} /> : null}
          </View>
          <Text variant="title3" style={styles.gapTop}>
            {b.service.name}
            {b.option ? (
              <Text variant="title3" tone="muted" weight="regular">{` · ${b.option.name}`}</Text>
            ) : null}
          </Text>
          {b.addons.length > 0 ? (
            <Text variant="callout" tone="muted">
              + {b.addons.map((a) => a.name).join(", ")}
            </Text>
          ) : null}
        </View>
        <DateTile date={toPlainDate(b.start, tz)} timeZone={tz} muted={!active} />
      </View>
      <Divider />
      <ListRow
        icon={Clock}
        title={`${formatRelativeDay(b.start, tz)} · ${formatTimeRange(b.start, b.end, tz)}`}
        subtitle={`${formatDuration(bookingMinutes(b))} · ${tz}`}
      />
      {b.resources.length > 0 ? (
        <>
          <Divider inset={space[12]} />
          <ListRow icon={UserRound} title={b.resources.map((r) => r.name).join(" · ")} subtitle="With" />
        </>
      ) : null}
      <Divider inset={space[12]} />
      <PriceRow booking={b} active={active} />
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
      <Divider inset={space[12]} />
      <ListRow icon={LinkIcon} title={b.reference} subtitle="Reference" />
      {active ? (
        <>
          <Divider />
          <View style={styles.actions}>
            {b.status !== "held" ? (
              <Button
                testID="add-to-calendar"
                variant="secondary"
                size="sm"
                icon={CalendarPlus}
                label="Add to calendar"
                onPress={() =>
                  void addToCalendar(b, manageUrl).then((r) => {
                    if (r === "saved") toast.show("Added to your calendar");
                    if (r === "failed") toast.show("We couldn't open your calendar.", "danger");
                  })
                }
              />
            ) : null}
            {b.canReschedule ? (
              <Button
                testID="reschedule"
                variant="secondary"
                size="sm"
                icon={CalendarClock}
                label="Reschedule"
                onPress={onReschedule}
              />
            ) : null}
            {b.canCancel ? (
              <Button
                testID="cancel-booking"
                variant="ghost"
                size="sm"
                icon={CalendarX2}
                label={`Cancel ${noun}`}
                onPress={onCancel}
              />
            ) : null}
          </View>
          {!b.canCancel && !b.canReschedule ? (
            <Text variant="callout" tone="muted" style={styles.contact}>
              Need to change something? Contact {b.business.name} directly
              {b.business.contactPhone ? (
                <>
                  {" on "}
                  <Text
                    variant="callout"
                    tone="brand"
                    accessibilityRole="link"
                    onPress={() => void callNumber(b.business.contactPhone ?? "")}
                  >
                    {b.business.contactPhone}
                  </Text>
                </>
              ) : null}
              .
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/**
 * The payment badge on the customer's own booking: "Deposit paid" while the rest is due at the appointment, else the
 * payment status (the website's CustomerPaymentBadge).
 */
export function customerPaymentBadge(
  b: Pick<ManagedBooking, "paymentStatus" | "depositCents" | "priceCents" | "amountPaidCents">,
) {
  if (balanceDueCents(b) !== null) return { label: "Deposit paid", tone: "success" as const };
  return PAYMENT_STATUS[b.paymentStatus];
}

/** The price (struck through when a deal applied), what was paid or refunded, what's due, and the deal. */
function PriceRow({ booking: b, active }: { booking: ManagedBooking; active: boolean }) {
  const deposit = balanceDueCents(b) !== null;
  const balance = active ? balanceDueCents(b) : null;
  const extras = [
    b.amountPaidCents > 0
      ? `${formatMoney(b.amountPaidCents, b.currency)} ${deposit ? "deposit paid" : "paid"}`
      : null,
    balance !== null ? `${formatMoney(balance, b.currency)} due at your appointment` : null,
    b.amountRefundedCents > 0 ? `${formatMoney(b.amountRefundedCents, b.currency)} refunded` : null,
  ].filter(Boolean);
  const dealt = b.originalPriceCents != null && b.originalPriceCents > b.priceCents;
  return (
    <View style={styles.priceRow} accessible testID="manage-price">
      <Icon icon={CreditCard} color="mutedForeground" />
      <View style={styles.flex}>
        <Text variant="footnote" tone="muted">
          Price
        </Text>
        {dealt && b.originalPriceCents != null ? (
          <DealPrice
            originalCents={b.originalPriceCents}
            priceCents={b.priceCents}
            currency={b.currency}
            variant="body"
          />
        ) : (
          <Text variant="body" weight="medium" numeric>
            {formatPrice(b.priceCents, b.currency)}
          </Text>
        )}
        {extras.length > 0 ? (
          <Text variant="callout" tone="muted" numeric>
            {extras.join(" · ")}
          </Text>
        ) : null}
        {b.offer ? (
          <View style={styles.deal}>
            <DealBadge label={b.offer.label} />
            <Text variant="callout" tone="muted">
              {b.offer.name}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Right after booking: the manage link is a guest's way back (the website offers to copy it; here, to share it). */
function SaveLinkCard({ url, noun }: { url: string; noun: string }) {
  return (
    <Card testID="save-link">
      <Text variant="headline">This is your {noun} link</Text>
      <Text variant="callout" tone="muted" style={styles.gapTop}>
        Keep it to reschedule or cancel later. It's also in your confirmation email.
      </Text>
      <View style={styles.gapTop}>
        <Button
          variant="secondary"
          size="sm"
          icon={Share2}
          label="Share link"
          onPress={() => void Share.share({ message: url, url }).catch(() => undefined)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  notFound: { gap: space[4], paddingTop: space[6] },
  loading: { gap: space[4] },
  hero: { flexDirection: "row", gap: space[4], alignItems: "flex-start", paddingVertical: space[2] },
  heroIcon: {
    width: space[12],
    height: space[12],
    borderRadius: radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, gap: space[1] },
  heroAction: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
  cardTop: { flexDirection: "row", gap: space[4], padding: space[4], alignItems: "flex-start" },
  flex: { flex: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  gapTop: { marginTop: space[2] },
  priceRow: {
    flexDirection: "row",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2.5],
    alignItems: "flex-start",
  },
  deal: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginTop: space[1.5],
    flexWrap: "wrap",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2], padding: space[4] },
  contact: { paddingHorizontal: space[4], paddingBottom: space[4] },
});
