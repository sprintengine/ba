import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Check, ShieldCheck, UserPlus } from "lucide-react-native";
import type { TeamMember } from "@shared/api/types";
import { useResources } from "@shared/api/hooks/use-resources";
import { useTeam } from "@shared/api/hooks/use-team";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { roleInfo } from "@shared/business/permissions";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { Card, ErrorState, GroupedItem, GroupTitle, Icon, IconButton, Skeleton, Text, useLayout } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { InviteSheet } from "./InviteSheet";
import { MemberRow } from "./MemberRow";
import { MemberSheet } from "./MemberSheet";
import { canManageMember, isLastOwner, linkablePeople, teamRows, type TeamRow } from "./team";

/**
 * `/dashboard/[slug]/team` (the website's TeamView): everyone on the team with their role and calendar, pending
 * invitations, and what each role can do. Owners and admins invite people and change roles from a member's sheet;
 * staff see the team.
 */
export function TeamScreen() {
  const { business, me } = useBusinessContext();
  const perms = usePermissions();
  const team = useTeam(business.id);
  const resources = useResources(business.id);
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const refetch = team.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const members = team.data ?? [];
  const people = linkablePeople(resources.data);
  const rows = teamRows(members);
  const calendarName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const open = members.find((m) => m.id === openId) ?? null;

  const onOpen = useCallback((m: TeamMember) => setOpenId(m.id), []);
  const renderItem = useCallback(
    ({ item, index }: { item: TeamRow; index: number }) => {
      if (item.kind === "header") return <GroupTitle title={item.title} />;
      const prev = rows[index - 1];
      const next = rows[index + 1];
      const m = item.member;
      return (
        <GroupedItem
          separatorInset={space[16]}
          first={!prev || prev.kind === "header"}
          last={!next || next.kind === "header"}
        >
          <MemberRow
            member={m}
            isMe={m.userId === me.user.id}
            calendar={calendarName(m.resourceId)}
            onPress={canManageMember(m, perms) ? onOpen : undefined}
            locale={business.locale}
            timezone={business.timezone}
          />
        </GroupedItem>
      );
    },
    // rows/people change with the data; the row components are memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, people, me.user.id, perms, onOpen, business.locale, business.timezone],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Team",
          headerLargeTitle: true,
          headerRight: () => (
            <HeaderActions business={business.slug}>
              {perms.manageTeam ? (
                <IconButton
                  icon={UserPlus}
                  accessibilityLabel="Invite someone"
                  color="brand"
                  onPress={() => setInviting(true)}
                  testID="team-invite"
                />
              ) : null}
            </HeaderActions>
          ),
        }}
      />
      {team.isError && !team.data ? (
        <View style={styles.fill}>
          <ErrorState error={team.error} onRetry={() => void refetch()} />
        </View>
      ) : (
        <FlashList
          testID="team-list"
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.kind}
          renderItem={renderItem}
          ListHeaderComponent={
            <Text variant="callout" tone="muted" style={[styles.width, styles.intro]}>
              Invite people and choose what they can do.
            </Text>
          }
          ListEmptyComponent={team.data ? null : <Loading />}
          ListFooterComponent={<Roles />}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
        />
      )}
      <InviteSheet visible={inviting} onClose={() => setInviting(false)} people={people} />
      {open ? (
        <MemberSheet
          member={open}
          onClose={() => setOpenId(null)}
          isMe={open.userId === me.user.id}
          lastOwner={isLastOwner(open, members)}
          canManage={canManageMember(open, perms)}
          people={people}
        />
      ) : null}
    </>
  );
}

/** What each role can do (the website's Roles cards). Everyone can see the whole team. */
function Roles() {
  const { v } = useVocabulary();
  const { isWide } = useLayout();
  const info = roleInfo(v);
  return (
    <View style={[styles.width, styles.roles]}>
      <View style={styles.rolesHeader}>
        <Text variant="title3">Roles</Text>
        <Text variant="callout" tone="muted">
          What each role can do. Everyone can see the whole team.
        </Text>
      </View>
      <View style={[styles.roleCards, isWide ? styles.roleCardsWide : null]}>
        {(["owner", "admin", "staff"] as const).map((r) => (
          <View key={r} style={isWide ? styles.roleCardWide : null}>
            <Card>
              <View style={styles.roleCard} accessible accessibilityLabel={roleLabel(info[r])}>
                <View style={styles.roleTitle}>
                  <Icon icon={ShieldCheck} size={18} color="brand" />
                  <Text variant="headline">{info[r].label}</Text>
                </View>
                <Text variant="callout" tone="muted">
                  {info[r].summary}
                </Text>
                {info[r].can.map((c) => (
                  <View key={c} style={styles.can}>
                    <Icon icon={Check} size={16} color="success" />
                    <Text variant="callout" tone="muted" style={styles.canText}>
                      {c}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ))}
      </View>
    </View>
  );
}

const roleLabel = (r: { label: string; summary: string; can: string[] }) =>
  `${r.label}. ${r.summary} ${r.can.join(". ")}.`;

function Loading() {
  return (
    <View
      style={[styles.width, styles.loading]}
      accessible
      accessibilityLabel="Loading the team"
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={72} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space[4], paddingBottom: space[12] },
  width: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  intro: { paddingBottom: space[4] },
  roles: { paddingTop: space[10], gap: space[4] },
  rolesHeader: { gap: space[1] },
  roleCards: { gap: space[3] },
  roleCardsWide: { flexDirection: "row", alignItems: "stretch" },
  roleCardWide: { flex: 1 },
  roleCard: { gap: space[2] },
  roleTitle: { flexDirection: "row", alignItems: "center", gap: space[2] },
  can: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  canText: { flex: 1 },
  loading: { gap: space[2] },
});
