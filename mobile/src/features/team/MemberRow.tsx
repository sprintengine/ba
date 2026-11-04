import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, Mail } from "lucide-react-native";
import type { TeamMember } from "@shared/api/types";
import { formatDate } from "@shared/format";
import { Badge, Icon, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { initials, ROLE_LABEL } from "./team";

export type MemberRowProps = {
  member: TeamMember;
  isMe: boolean;
  /** The linked calendar's name. */
  calendar: string | null;
  /** Opens the member's sheet (managers only); a plain row otherwise. */
  onPress?: (member: TeamMember) => void;
  locale: string;
  timezone: string;
};

/** One team member: avatar (or an envelope for an invitation), name and email, role, linked calendar. */
export const MemberRow = memo(function MemberRow({
  member: m,
  isMe,
  calendar,
  onPress,
  locale,
  timezone,
}: MemberRowProps) {
  const { colors } = useTheme();
  const invited = m.status === "invited";
  const title = m.name || m.email;
  const details = [
    m.name ? m.email : null,
    invited ? `Invited ${formatDate(m.createdAt, timezone, "short", locale)}` : null,
    calendar,
  ].filter((x): x is string => !!x);
  const label = [
    title,
    isMe ? "you" : null,
    ROLE_LABEL[m.role],
    invited ? "invitation pending" : null,
    ...details.slice(m.name ? 1 : 0),
  ]
    .filter(Boolean)
    .join(", ");
  const content = (
    <>
      {invited ? (
        <View style={[styles.avatar, styles.invited, { borderColor: colors.borderStrong }]}>
          <Icon icon={Mail} size={18} color="subtleForeground" />
        </View>
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text variant="callout" weight="semibold" tone="brand" maxFontSizeMultiplier={1.2}>
            {initials(m.name ?? m.email)}
          </Text>
        </View>
      )}
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text weight="medium" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {isMe ? <Badge label="You" /> : null}
        </View>
        {details.length > 0 ? (
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {details.join(" · ")}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <Badge label={ROLE_LABEL[m.role]} tone={m.role === "owner" ? "brand" : "neutral"} />
          {invited ? <Badge label="Invited" tone="warning" /> : null}
        </View>
      </View>
      {onPress ? <Icon icon={ChevronRight} size={18} color="subtleForeground" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label} testID={`member-${m.email}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={`member-${m.email}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={invited ? "Change or revoke the invitation" : "Change their role or calendar"}
      onPress={() => onPress(m)}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
    >
      {content}
    </Pressable>
  );
});

const AVATAR = 40;

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  invited: { borderWidth: 1, borderStyle: "dashed" },
  text: { flex: 1, gap: space[1] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  title: { flexShrink: 1 },
  badges: { flexDirection: "row", gap: space[1.5] },
});
