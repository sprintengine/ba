import { router, Stack, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarDays, CalendarOff, CalendarPlus } from "lucide-react-native";
import { useOverview } from "@shared/api/hooks/use-business";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { firstName, todaysBookings } from "@shared/dashboard/overview";
import { greetingAt, todayInTz } from "@shared/format";
import { useNow } from "@shared/hooks/use-now";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { Button, ErrorState, ScreenScroll, Text, useLayout } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { useBookingActions } from "~/features/bookings/BookingActions";
import { useFmt } from "~/features/bookings/fmt";
import { HeaderNew } from "~/features/bookings/HeaderNew";
import { useKeyCommands } from "~/features/bookings/keys";
import { BlockTimeSheet } from "~/features/calendar/BlockTimeSheet";
import { Nudges, PendingApprovals, SetupChecklist, ShareCard, StatTiles, TodaySchedule } from "./cards";

/**
 * `/dashboard/[slug]` (Today): a greeting, quick actions (new booking, block time, calendar), the figures, today's
 * schedule, requests waiting for approval, what Bo noticed, setup and the booking page. Two columns on large screens.
 */
export function TodayScreen() {
  const { business, me } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { isWide } = useLayout();
  const now = useNow();
  const today = todayInTz(business.timezone, now);
  const overview = useOverview(business.id, today);
  const { openNewBooking } = useBookingActions();
  const [blocking, setBlocking] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(overview.refetch);
  useRefetchOnFocus(overview.refetch);
  const todays = todaysBookings(overview.data?.today ?? []);
  const name = firstName(me.user.name);
  const count =
    todays.length === 0
      ? `No ${v("bookings")} today`
      : `${todays.length} ${v("booking", { count: todays.length })} today`;
  const newBooking = useCallback(() => openNewBooking(), [openNewBooking]);
  useKeyCommands({
    n: { title: `New ${v("booking")}`, run: newBooking },
    b: { title: "Block time", run: () => setBlocking(true) },
  });

  const schedule = <TodaySchedule bookings={todays} loading={overview.isPending} now={now} />;
  const side = (
    <>
      <PendingApprovals today={today} />
      <Nudges />
      {perms.manageSettings && overview.data ? <SetupChecklist items={overview.data.checklist} /> : null}
      <ShareCard />
    </>
  );

  return (
    <ScreenScroll
      testID="today"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      contentContainerStyle={isWide ? styles.wide : null}
    >
      <Stack.Screen
        options={{
          title: "Today",
          headerLargeTitle: !isWide,
          headerRight: () => (
            <HeaderNew label={`New ${v("booking")}`} onPress={newBooking} testID="new-booking" />
          ),
        }}
      />
      <View style={styles.greeting}>
        <Text variant="title2">{`${greetingAt(now, business.timezone)}${name ? `, ${name}` : ""}`}</Text>
        <Text variant="callout" tone="muted">
          {overview.data ? `${fmt.date(today, "long")} · ${count}` : fmt.date(today, "long")}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          testID="today-new-booking"
          label={`New ${v("booking")}`}
          icon={CalendarPlus}
          onPress={newBooking}
        />
        <Button
          testID="today-block-time"
          label="Block time"
          icon={CalendarOff}
          variant="secondary"
          onPress={() => setBlocking(true)}
        />
        <Button
          label="Calendar"
          icon={CalendarDays}
          variant="secondary"
          onPress={() => router.navigate(`/dashboard/${business.slug}/calendar` as Href)}
        />
      </View>
      {overview.isError && !overview.data ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <StatTiles overview={overview.data} todays={todays} now={now} loading={overview.isPending} />
          {isWide ? (
            <View style={styles.columns}>
              <View style={styles.main}>{schedule}</View>
              <View style={styles.side}>{side}</View>
            </View>
          ) : (
            <>
              <PendingApprovals today={today} />
              {schedule}
              <Nudges />
              {perms.manageSettings && overview.data ? (
                <SetupChecklist items={overview.data.checklist} />
              ) : null}
              <ShareCard />
            </>
          )}
        </>
      )}
      <BlockTimeSheet visible={blocking} onClose={() => setBlocking(false)} date={today} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  wide: { maxWidth: layout.maxContentWidth * 1.6 },
  greeting: { gap: space[1] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  columns: { flexDirection: "row", gap: space[6], alignItems: "flex-start" },
  main: { flex: 3, gap: space[6] },
  side: { flex: 2, gap: space[6] },
});
