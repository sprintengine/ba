/** Today's cards: stats, the day's schedule, requests waiting for approval, Bo's nudges, setup and the booking link. */
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { ArrowUpRight, CalendarDays, Check, ExternalLink, Share2, Sparkles, X } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useAssistantState, useDismissNudge } from "@shared/api/hooks/use-assistant";
import { useBookings } from "@shared/api/hooks/use-bookings";
import type { Booking, ChecklistKey, Nudge, Overview } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { checklistProgress, checklistSteps, todayHint } from "@shared/dashboard/overview";
import { useVocabulary } from "@shared/vocabulary";
import { Badge, Button, Card, Divider, IconButton, ListRow, Skeleton, Text, useTheme, useToast } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { openWebsite, websiteUrl } from "~/lib/links";
import { logError } from "~/lib/logger";
import { useApprove } from "~/features/bookings/BookingActionBar";
import { useBookingActions } from "~/features/bookings/BookingActions";
import { DeclineSheet } from "~/features/bookings/DeclineSheet";
import { useFmt } from "~/features/bookings/fmt";
import { SectionTitle, StatusBadges } from "~/features/bookings/parts";

/** `/dashboard/{slug}{path}` for a path the API gives relative to the dashboard ("/bookings?status=…"). */
export function dashboardHref(slug: string, path: string): Href {
  return `/dashboard/${slug}/${path.replace(/^\//, "")}` as Href;
}

/** Today, the next 7 days, the last 30 days and (owners and admins) revenue. */
export function StatTiles({
  overview,
  todays,
  now,
  loading,
}: {
  overview: Overview | undefined;
  todays: Booking[];
  now: Date;
  loading: boolean;
}) {
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const tiles: { label: string; value: string; hint: string }[] = [
    { label: "Today", value: String(todays.length), hint: loading ? " " : todayHint(todays, now, fmt.time) },
    {
      label: "Next 7 days",
      value: String(overview?.upcomingCount7d ?? 0),
      hint: `Upcoming ${v("bookings")}`,
    },
    {
      label: v("bookings", { title: true }),
      value: String(overview?.bookings30d ?? 0),
      hint: "Booked in the last 30 days",
    },
  ];
  if (perms.viewRevenue) {
    tiles.push({
      label: "Revenue",
      value: fmt.money(overview?.revenueCents30d ?? 0),
      hint: "Last 30 days, after refunds",
    });
  }
  return (
    <View style={styles.tiles}>
      {tiles.map((t, i) => (
        <View
          key={t.label}
          style={[styles.tileBox, tiles.length === 3 && i === 2 ? styles.tileFull : null]}
          testID={`stat-${i}`}
        >
          <Card style={styles.tile}>
            <View
              accessible
              accessibilityLabel={loading ? `${t.label}, loading` : `${t.label}: ${t.value}. ${t.hint}`}
            >
              <Text variant="footnote" tone="muted">
                {t.label}
              </Text>
              {loading ? (
                <Skeleton height={28} width="50%" />
              ) : (
                <Text variant="title2" numeric>
                  {t.value}
                </Text>
              )}
              <Text variant="footnote" tone="subtle" numberOfLines={1}>
                {t.hint}
              </Text>
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

/** Today's bookings in order, with a "Now" line; past ones' times muted. */
export function TodaySchedule({
  bookings,
  loading,
  now,
}: {
  bookings: Booking[];
  loading: boolean;
  now: Date;
}) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { colors } = useTheme();
  const { openBooking, openNewBooking } = useBookingActions();
  const nowIndex = bookings.findIndex((b) => new Date(b.start) > now);
  return (
    <View testID="today-schedule">
      <SectionTitle
        title={`Today's ${v("bookings")}`}
        action={
          <Button
            label="Open calendar"
            icon={CalendarDays}
            variant="ghost"
            size="sm"
            onPress={() => router.navigate(`/dashboard/${business.slug}/calendar` as Href)}
          />
        }
      />
      <Card padding={0}>
        {loading ? (
          <View style={styles.padded} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={44} radius="lg" />
            ))}
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="headline" align="center">
              Nothing booked today
            </Text>
            <Text variant="callout" tone="muted" align="center">
              New {v("bookings")} show up here as they come in.
            </Text>
            <Button
              label={`New ${v("booking")}`}
              variant="secondary"
              size="sm"
              onPress={() => openNewBooking()}
            />
          </View>
        ) : (
          bookings.map((b, i) => {
            const past = new Date(b.end) <= now;
            const detail = [b.service.name, b.option?.name, b.resources.map((r) => r.name).join(", ")]
              .filter(Boolean)
              .join(" · ");
            return (
              <View key={b.id}>
                {i === nowIndex && i > 0 ? (
                  <View
                    style={styles.nowRow}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
                    <View style={[styles.nowLine, { backgroundColor: colors.danger }]} />
                    <Text variant="caption" tone="danger" numeric>
                      Now · {fmt.time(now)}
                    </Text>
                  </View>
                ) : i > 0 ? (
                  <Divider inset={space[16]} />
                ) : null}
                <ListRow
                  testID={`today-${b.reference}`}
                  title={b.customer.name}
                  subtitle={detail}
                  leading={
                    <View style={styles.time}>
                      <Text variant="callout" weight="semibold" numeric tone={past ? "subtle" : "default"}>
                        {fmt.time(b.start)}
                      </Text>
                      <View style={[styles.serviceBar, { backgroundColor: b.service.color }]} />
                    </View>
                  }
                  trailing={b.status === "confirmed" ? undefined : <StatusBadges status={b.status} />}
                  onPress={() => openBooking(b.id)}
                />
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

const SHOWN = 20;

/** Upcoming bookings waiting for approval (the first 20) with approve and decline; nothing when there are none. */
export function PendingApprovals({ today }: { today: string }) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { openBooking } = useBookingActions();
  const pending = useBookings(business.id, { status: "pending_approval", from: today, limit: SHOWN });
  const approval = useApprove();
  const [declining, setDeclining] = useState<Booking | null>(null);
  const items = pending.data?.items ?? [];
  const more = !!pending.data?.nextCursor;
  if (pending.isPending || items.length === 0) return null;
  return (
    <View testID="pending-approvals">
      <SectionTitle
        title="Waiting for approval"
        action={
          <View style={styles.row}>
            <Badge label={more ? `${items.length}+` : String(items.length)} tone="info" />
            <Button
              label="See all"
              variant="ghost"
              size="sm"
              onPress={() =>
                router.navigate(dashboardHref(business.slug, "/bookings?status=pending_approval"))
              }
            />
          </View>
        }
      />
      <Card padding={0}>
        <Text variant="callout" tone="muted" style={styles.cardIntro}>
          {v("customers", { title: true })} hear back as soon as you decide.
        </Text>
        {items.map((b) => (
          <View key={b.id}>
            <Divider />
            <View style={styles.pendingRow}>
              <View style={styles.flex}>
                <ListRow
                  testID={`pending-${b.reference}`}
                  title={b.customer.name}
                  subtitle={`${b.service.name} · ${fmt.relDay(b.start)}, ${fmt.time(b.start)}`}
                  chevron={false}
                  onPress={() => openBooking(b.id)}
                />
              </View>
              <IconButton
                testID={`decline-${b.reference}`}
                icon={X}
                accessibilityLabel={`Decline ${b.customer.name}`}
                onPress={() => setDeclining(b)}
              />
              <IconButton
                testID={`approve-${b.reference}`}
                icon={Check}
                color="success"
                accessibilityLabel={`Approve ${b.customer.name}`}
                accessibilityState={{ busy: approval.isApproving(b.id) }}
                disabled={approval.isApproving(b.id)}
                onPress={() => void approval.approve(b.id)}
              />
            </View>
          </View>
        ))}
      </Card>
      {declining ? <DeclineSheet booking={declining} visible onClose={() => setDeclining(null)} /> : null}
    </View>
  );
}

/**
 * What Bo noticed (owners and admins): each with its action, "Ask Bo", and dismiss. Nothing where the deployment doesn't
 * offer Bo (`assistantAvailable`): its nudges aren't served then.
 */
export function Nudges() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const shown = perms.manageAssistant && !!business.assistantAvailable;
  const state = useAssistantState(business.id, { enabled: shown });
  const nudges = state.data?.nudges ?? [];
  if (!shown || nudges.length === 0) return null;
  return (
    <View testID="nudges">
      <SectionTitle title={`${ASSISTANT_NAME} noticed`} />
      <View style={styles.list}>
        {nudges.map((n) => (
          <NudgeCard
            key={n.id}
            nudge={n}
            canAsk={!!state.data?.configured && !state.data.credits.limitReached}
          />
        ))}
      </View>
    </View>
  );
}

function NudgeCard({ nudge, canAsk }: { nudge: Nudge; canAsk: boolean }) {
  const { business } = useBusinessContext();
  const { colors } = useTheme();
  const toast = useToast();
  const dismiss = useDismissNudge(business.id, { onError: (err) => toast.show(errorMessage(err), "danger") });
  return (
    <Card
      testID={`nudge-${nudge.id}`}
      style={{ borderColor: nudge.severity === "warning" ? colors.warning : colors.border }}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
            { backgroundColor: nudge.severity === "warning" ? colors.warning : colors.brand },
          ]}
        />
        <Text weight="semibold" style={styles.flex}>
          {nudge.title}
        </Text>
        <IconButton
          icon={X}
          size={18}
          accessibilityLabel={`Dismiss: ${nudge.title}`}
          disabled={dismiss.isPending}
          onPress={() => dismiss.mutate(nudge.id)}
        />
      </View>
      <Text variant="callout" tone="muted">
        {nudge.body}
      </Text>
      <View style={[styles.row, styles.nudgeActions]}>
        {nudge.action ? (
          <Button
            label={nudge.action.label}
            icon={ArrowUpRight}
            variant="secondary"
            size="sm"
            onPress={() => router.navigate(dashboardHref(business.slug, nudge.action!.path))}
          />
        ) : null}
        {canAsk ? (
          <Button
            label={`Ask ${ASSISTANT_NAME}`}
            icon={Sparkles}
            variant="ghost"
            size="sm"
            onPress={() =>
              router.push({
                pathname: "/assistant",
                params: { business: business.slug, ask: nudge.prompt },
              })
            }
          />
        ) : null}
      </View>
    </Card>
  );
}

/** "Get set up": progress and the steps left (owners and admins), until everything is done. */
export function SetupChecklist({ items }: { items: { key: ChecklistKey; done: boolean }[] }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const { colors } = useTheme();
  const progress = checklistProgress(items);
  if (progress.complete) return null;
  const steps = checklistSteps(v);
  return (
    <View testID="setup-checklist">
      <SectionTitle
        title="Get set up"
        action={
          <Text variant="callout" tone="brand" weight="semibold" numeric>{`${progress.percent}%`}</Text>
        }
      />
      <Card padding={0}>
        <View style={styles.cardIntro}>
          <Text variant="callout" tone="muted">
            {progress.done} of {progress.total} done
          </Text>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Setup progress"
            accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
            style={[styles.track, { backgroundColor: colors.muted }]}
          >
            <View style={[styles.fill, { width: `${progress.percent}%`, backgroundColor: colors.brand }]} />
          </View>
        </View>
        {items.map((item) => {
          const step = steps[item.key];
          const locked = !!step.ownerOnly && !perms.managePayments;
          return (
            <View key={item.key}>
              <Divider />
              <ListRow
                title={item.done ? `${step.label} (done)` : step.label}
                subtitle={item.done ? undefined : locked ? "Ask the owner to do this." : step.hint}
                icon={item.done ? Check : undefined}
                onPress={
                  item.done || locked
                    ? undefined
                    : () => router.navigate(dashboardHref(business.slug, step.href))
                }
              />
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/** The public booking page: its link to share or open, and whether it's live. */
export function ShareCard() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const url = websiteUrl(`/${business.slug}`);
  const draft = business.status !== "active";
  return (
    <View testID="share-card">
      <SectionTitle
        title="Your booking page"
        action={draft ? <Badge label="Draft" tone="warning" /> : <Badge label="Live" tone="success" />}
      />
      <Card>
        <Text variant="callout" tone="muted">
          {draft
            ? "Only your team can see it until you publish."
            : "Add the link to your website, Instagram or Google profile."}
        </Text>
        <Text variant="footnote" tone="subtle" selectable numberOfLines={1} style={styles.url}>
          {url.replace(/^https?:\/\//, "")}
        </Text>
        <View style={[styles.row, styles.nudgeActions]}>
          <Button
            label="Share link"
            icon={Share2}
            variant="secondary"
            size="sm"
            onPress={() => void Share.share({ message: url, url }).catch((e: unknown) => logError(e))}
          />
          <Button
            label="Open"
            icon={ExternalLink}
            variant="ghost"
            size="sm"
            onPress={() => void openWebsite(`/${business.slug}`)}
          />
          {draft && perms.manageSettings ? (
            <Button
              label="Publish settings"
              variant="ghost"
              size="sm"
              onPress={() => router.navigate(dashboardHref(business.slug, "settings/general"))}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[1.5] },
  tileBox: { width: "50%", padding: space[1.5] },
  tileFull: { width: "100%" },
  tile: { gap: space[1] },
  padded: { padding: space[4], gap: space[3] },
  empty: { padding: space[6], gap: space[2], alignItems: "center" },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[1],
  },
  nowDot: { width: space[1.5], height: space[1.5], borderRadius: radius.full },
  nowLine: { flex: 1, height: StyleSheet.hairlineWidth },
  time: { width: space[16] - space[2], flexDirection: "row", alignItems: "center", gap: space[2] },
  serviceBar: { width: space[0.5] + 1, height: MIN_TOUCH - space[3], borderRadius: radius.full },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
  list: { gap: space[3] },
  cardIntro: { paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
  pendingRow: { flexDirection: "row", alignItems: "center", paddingRight: space[2] },
  dot: { width: space[2], height: space[2], borderRadius: radius.full },
  nudgeActions: { flexWrap: "wrap", marginTop: space[3] },
  track: { height: space[1.5], borderRadius: radius.full, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
  url: { marginTop: space[2] },
});
