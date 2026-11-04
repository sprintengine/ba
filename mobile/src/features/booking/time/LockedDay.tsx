import { StyleSheet, View } from "react-native";
import { ChevronRight, Clock, Lock } from "lucide-react-native";
import { formatDate, formatRelativeDay, type PlainDate } from "@shared/format";
import { useCountdown } from "@shared/hooks/use-now";
import { opensLabel } from "@shared/releases/text";
import { Button, Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { Callout } from "../Callout";
import { formatOpensIn, WATCH_MS } from "./refetch";

/**
 * A day that has times but isn't open for online booking yet (§21): when it opens (a countdown in its last hours) or
 * that the business hasn't opened it, and a way on to the next day with free times.
 */
export function LockedDay({
  date,
  opensAt,
  timeZone,
  locale,
  nextAvailable,
  onNextAvailable,
}: {
  date: PlainDate;
  /** When it opens; null when the business holds it until they open it. */
  opensAt: string | null;
  timeZone: string;
  locale?: string;
  nextAvailable: PlainDate | null;
  onNextAvailable: (date: PlainDate) => void;
}) {
  const { colors } = useTheme();
  const left = useCountdown(opensAt);
  const day = formatDate(date, timeZone, "long", locale);
  return (
    <Callout
      testID="locked-day"
      icon={null}
      action={
        nextAvailable ? (
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            label={`Next available: ${formatRelativeDay(nextAvailable, timeZone, locale)}`}
            onPress={() => onNextAvailable(nextAvailable)}
          />
        ) : null
      }
    >
      <View style={[styles.lock, { backgroundColor: colors.brandSoft }]}>
        <Icon icon={Lock} size={18} color="brandSoftForeground" />
      </View>
      <Text variant="headline">
        {opensAt ? `Opens ${opensLabel(opensAt, timeZone, locale)}` : "Not open for online booking yet"}
      </Text>
      <Text variant="callout" tone="muted">
        {opensAt
          ? `Times for ${day} aren't open for online booking yet. Come back then to book.`
          : `${day} hasn't been opened for online booking yet. Please check back later or contact the business.`}
      </Text>
      {left !== null && left > 0 && left <= WATCH_MS ? (
        <View style={[styles.countdown, { backgroundColor: colors.muted }]}>
          <Icon icon={Clock} size={16} color="mutedForeground" />
          <Text variant="callout" weight="medium" numeric>
            Opens in {formatOpensIn(left)}
          </Text>
        </View>
      ) : null}
      {left === 0 ? (
        <Text variant="callout" tone="muted" accessibilityLiveRegion="polite">
          Opening now…
        </Text>
      ) : null}
    </Callout>
  );
}

const styles = StyleSheet.create({
  lock: {
    width: space[10],
    height: space[10],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  countdown: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
