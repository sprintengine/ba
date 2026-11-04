/**
 * Small pieces the business-day screens share (Today, Calendar, Bookings, Customers): a person's initials, status
 * badges, a colour dot, a section heading, a tinted callout and a selectable chip. The website's equivalents live in
 * `components/dashboard/common.tsx` and `components/ui`.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BookingStatus, PaymentStatus } from "@shared/api/types";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@shared/status";
import { Badge, Icon, Text, useTheme, type IconComponent } from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space, type ThemeColors } from "~/ui/tokens";

/** "Rowan Example" → "RE". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** A person's initials in a circle (decorative: their name is always beside it). */
export function PersonAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandSoft },
      ]}
    >
      <Text
        variant={size >= 48 ? "headline" : "footnote"}
        weight="semibold"
        style={{ color: colors.brandSoftForeground }}
        maxFontSizeMultiplier={1.2}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** A booking's status, and its payment status when given. */
export function StatusBadges({ status, payment }: { status: BookingStatus; payment?: PaymentStatus }) {
  const s = BOOKING_STATUS[status];
  const p = payment ? PAYMENT_STATUS[payment] : null;
  return (
    <View style={styles.badges}>
      <Badge label={s.label} tone={s.tone} />
      {p ? <Badge label={p.label} tone={p.tone} /> : null}
    </View>
  );
}

/** A service's or resource's colour (data, not a theme colour). Decorative. */
export function ColorDot({ color, size = space[2.5] }: { color: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.borderStrong,
      }}
    />
  );
}

/** A labelled block's heading ("PAYMENT"), with an optional action on the right. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="caption" tone="subtle" accessibilityRole="header" style={styles.flex}>
        {title.toUpperCase()}
      </Text>
      {action}
    </View>
  );
}

const CALLOUT: Record<"warning" | "info" | "danger" | "success", [keyof ThemeColors, keyof ThemeColors]> = {
  warning: ["warningSoft", "warningSoftForeground"],
  info: ["infoSoft", "infoSoftForeground"],
  danger: ["dangerSoft", "dangerSoftForeground"],
  success: ["successSoft", "successSoftForeground"],
};

/** A tinted note with an icon (held for payment, needs approval, cancelled). */
export function Callout({
  tone,
  icon,
  children,
  testID,
}: {
  tone: keyof typeof CALLOUT;
  icon: IconComponent;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [bg, fg] = CALLOUT[tone];
  return (
    <View testID={testID} accessible style={[styles.callout, { backgroundColor: colors[bg] }]}>
      <Icon icon={icon} size={18} color={fg} />
      <View style={styles.flex}>
        {typeof children === "string" ? (
          <Text variant="callout" style={{ color: colors[fg] }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconComponent;
  /** A count or short value after the label ("Status 2"). */
  count?: number;
  /** "radio" in a one-of group (times, resources), "button" for a filter that opens a sheet. */
  role?: "radio" | "button" | "checkbox";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  testID?: string;
};

/** A pill: a filter, a choice in a row of choices, a free time. 44pt tall to touch. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  count,
  role = "button",
  accessibilityLabel,
  accessibilityHint,
  disabled,
  testID,
}: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? (count ? `${label}, ${count}` : label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={
        role === "button" ? { selected, disabled: !!disabled } : { checked: selected, disabled: !!disabled }
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.primary : colors.borderStrong,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon ? (
        <Icon icon={icon} size={16} color={selected ? "primaryForeground" : "mutedForeground"} />
      ) : null}
      <Text
        variant="callout"
        weight="medium"
        numeric
        tone={selected ? "primaryForeground" : "default"}
        numberOfLines={1}
      >
        {label}
        {count ? `  ${count}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: space[6],
    marginBottom: space[2],
  },
  flex: { flex: 1 },
  callout: {
    flexDirection: "row",
    gap: space[2.5],
    padding: space[3],
    borderRadius: radius.lg,
    alignItems: "flex-start",
  },
  chip: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: space[1.5],
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: borderWidth.hairline,
  },
});
