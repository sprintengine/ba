import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { MemberRole, TeamMember } from "@shared/api/types";
import { useRemoveTeamMember, useUpdateTeamMember } from "@shared/api/hooks/use-team";
import { useBusinessContext } from "@shared/business/business-context";
import { assignableRoles, roleInfo } from "@shared/business/permissions";
import { useVocabulary } from "@shared/vocabulary";
import { Banner, Button, RadioGroup, Select, Sheet, Text } from "~/ui";
import { confirmAction, useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { ROLE_LABEL, roleLockReason } from "./team";

export type MemberSheetProps = {
  member: TeamMember | null;
  onClose: () => void;
  isMe: boolean;
  lastOwner: boolean;
  /** May change this member (an owner only by an owner). */
  canManage: boolean;
  people: { id: string; name: string }[];
};

/**
 * A member's settings (the website's MemberRow controls): role, linked calendar, remove or revoke. Each change
 * saves at once, shown straight away and put back if the server refuses.
 */
export function MemberSheet({ member, onClose, isMe, lastOwner, canManage, people }: MemberSheetProps) {
  const { business, role: myRole } = useBusinessContext();
  const { v } = useVocabulary();
  const update = useUpdateTeamMember(business.id);
  const remove = useRemoveTeamMember(business.id);
  const feedback = useSaveFeedback();
  // What was just picked, shown while it saves (and dropped if it fails).
  const [pending, setPending] = useState<{ role?: MemberRole; resourceId?: string | null }>({});
  if (!member) return null;
  const invited = member.status === "invited";
  const title = member.name || member.email;
  const info = roleInfo(v);
  const lock = roleLockReason({ isMe, lastOwner, canManage });
  const role = pending.role ?? member.role;
  const resourceId = pending.resourceId !== undefined ? pending.resourceId : member.resourceId;

  const patch = async (input: { role?: MemberRole; resourceId?: string | null }, message: string) => {
    setPending((p) => ({ ...p, ...input }));
    await feedback.run(() => update.mutateAsync({ id: member.id, input }), message);
    setPending({});
  };

  const removeMember = async () => {
    const ok = await confirmAction(
      invited
        ? {
            title: `Revoke the invite for ${member.email}?`,
            message: "The invite link stops working.",
            confirmLabel: "Revoke",
            destructive: true,
          }
        : {
            title: `Remove ${title}?`,
            message: "They lose access straight away. Their bookings and calendar stay.",
            confirmLabel: "Remove",
            destructive: true,
          },
    );
    if (!ok) return;
    const done = await feedback.run(
      () => remove.mutateAsync(member.id),
      invited ? "Invite revoked" : "Removed from the team",
    );
    if (done) onClose();
  };

  return (
    <Sheet visible onClose={onClose} title={title} testID="member-sheet">
      {member.name ? (
        <Text tone="muted" selectable>
          {member.email}
        </Text>
      ) : null}
      {lock || !canManage ? (
        <View style={styles.block}>
          <Text variant="callout" weight="medium">
            Role
          </Text>
          <Text>{ROLE_LABEL[member.role]}</Text>
          {lock ? (
            <Text variant="footnote" tone="subtle">
              {lock}
            </Text>
          ) : null}
        </View>
      ) : (
        <RadioGroup
          label="Role"
          testID="member-role"
          value={role}
          disabled={update.isPending}
          options={assignableRoles(myRole)
            .slice()
            .reverse()
            .map((r) => ({ value: r, label: info[r].label, description: info[r].summary }))}
          onChange={(r) => {
            if (r !== role) void patch({ role: r }, "Role updated");
          }}
        />
      )}
      {canManage && people.length > 0 ? (
        <Select
          label={`Linked ${v("resource")}`}
          testID="member-calendar"
          value={resourceId ?? "none"}
          options={[
            { value: "none", label: "No calendar" },
            ...people.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(value) => {
            const next = value === "none" ? null : value;
            if (next !== resourceId)
              void patch({ resourceId: next }, next ? "Calendar linked" : "Calendar unlinked");
          }}
        />
      ) : null}
      {canManage && !isMe ? (
        lastOwner ? (
          <Banner tone="neutral">The last owner can&apos;t be removed.</Banner>
        ) : (
          <View style={styles.remove}>
            <Button
              testID="member-remove"
              variant="destructive"
              icon={Trash2}
              label={invited ? "Revoke invite" : "Remove from team"}
              loading={remove.isPending}
              onPress={() => void removeMember()}
            />
          </View>
        )
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[1] },
  remove: { marginTop: space[4] },
});
