import { StyleSheet, View } from "react-native";
import { MailOpen } from "lucide-react-native";
import { useSignedInMe } from "~/shell/session";
import { Icon, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";

/**
 * Team invitations still pending on My bookings (the website's InvitationBanner). Invitations for the person's email
 * are accepted when /v1/me loads, so one still pending is waiting for a seat (the team is at its plan's limit): it is
 * accepted automatically once the business makes room.
 */
export function InvitationBanners() {
  const { colors } = useTheme();
  const me = useSignedInMe();
  const invitations = me.data?.pendingInvitations ?? [];
  if (invitations.length === 0) return null;
  return (
    <View style={styles.list}>
      {invitations.map((inv) => (
        <View
          key={inv.token}
          testID={`invitation-${inv.token}`}
          accessible
          style={[styles.banner, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}
        >
          <View style={[styles.icon, { backgroundColor: colors.surface }]}>
            <Icon icon={MailOpen} size={16} color="brand" />
          </View>
          <View style={styles.text}>
            <Text variant="callout" weight="semibold" style={{ color: colors.brandSoftForeground }}>
              You're invited to join {inv.businessName}
            </Text>
            <Text variant="footnote" style={{ color: colors.brandSoftForeground }}>
              As {inv.role === "admin" ? "an admin" : `a ${inv.role}`}, but their team is full on its current
              plan. You'll join automatically once they free up a seat or upgrade.
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
  banner: {
    flexDirection: "row",
    gap: space[3],
    padding: space[4],
    borderRadius: radius["2xl"],
    borderWidth: borderWidth.hairline,
  },
  icon: {
    width: space[8],
    height: space[8],
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: space[0.5] },
});
