"use client";

import { Mail, Trash2 } from "lucide-react";
import type { MemberRole, TeamMember } from "@/lib/api/types";
import { useRemoveTeamMember, useUpdateTeamMember } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { assignableRoles } from "@/lib/business/permissions";
import { useVocabulary } from "@/lib/vocabulary";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { withToast } from "@/components/common/with-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useFmt } from "../common";

type Person = { id: string; name: string };
type Patch = (input: { role?: MemberRole; resourceId?: string | null }, message: string) => Promise<void>;

/** One team member: who they are, their linked calendar, their role and (for managers) remove/revoke. */
export function MemberRow({
  member: m,
  isMe,
  myRole,
  lastOwner,
  people,
  canManage,
}: {
  member: TeamMember;
  isMe: boolean;
  myRole: MemberRole;
  lastOwner: boolean;
  people: Person[];
  canManage: boolean;
}) {
  const { business } = useBusinessContext();
  const update = useUpdateTeamMember(business.id);

  const patch: Patch = async (input, message) => {
    await withToast(() => update.mutateAsync({ id: m.id, input }), message);
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <MemberIdentity member={m} isMe={isMe} />
      <div className="flex min-w-0 items-center gap-2">
        <CalendarControl member={m} people={people} editable={canManage} patch={patch} />
        <RoleControl
          member={m}
          myRole={myRole}
          editable={canManage && !isMe && !lastOwner}
          isMe={isMe}
          lastOwner={lastOwner}
          patch={patch}
        />
        {canManage && !isMe && <RemoveControl member={m} lastOwner={lastOwner} />}
      </div>
    </li>
  );
}

function MemberIdentity({ member: m, isMe }: { member: TeamMember; isMe: boolean }) {
  const fmt = useFmt();
  const invited = m.status === "invited";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {invited ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-subtle-foreground">
          <Mail className="size-4" />
        </span>
      ) : (
        <Avatar name={m.name ?? m.email} size="lg" className="size-9" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{m.name || m.email}</span>
          {isMe && <Badge className="h-5 shrink-0">You</Badge>}
          {invited && (
            <Badge tone="warning" className="h-5 shrink-0">
              Invited
            </Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {m.name ? m.email : ""}
          {invited ? `${m.name ? " · " : ""}Invited ${fmt.date(m.createdAt, "short")}` : ""}
        </span>
      </div>
    </div>
  );
}

/** The linked calendar: a select for managers, else its name (if any). */
function CalendarControl({
  member: m,
  people,
  editable,
  patch,
}: {
  member: TeamMember;
  people: Person[];
  editable: boolean;
  patch: Patch;
}) {
  const { v } = useVocabulary();
  if (!editable || people.length === 0) {
    const resourceName = people.find((p) => p.id === m.resourceId)?.name;
    return resourceName ? <span className="text-xs text-muted-foreground">{resourceName}</span> : null;
  }
  return (
    <Select
      value={m.resourceId ?? "none"}
      onValueChange={(val) =>
        patch(
          { resourceId: val === "none" ? null : val },
          val === "none" ? "Calendar unlinked" : "Calendar linked",
        )
      }
    >
      <SelectTrigger
        size="sm"
        className="w-auto min-w-0 flex-1 sm:w-44 sm:flex-none"
        aria-label={`Linked ${v("resource")} for ${m.name || m.email}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No calendar</SelectItem>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The role: a select when it can be changed, else a badge explaining why not. */
function RoleControl({
  member: m,
  myRole,
  editable,
  isMe,
  lastOwner,
  patch,
}: {
  member: TeamMember;
  myRole: MemberRole;
  editable: boolean;
  isMe: boolean;
  lastOwner: boolean;
  patch: Patch;
}) {
  if (editable) {
    return (
      <Select value={m.role} onValueChange={(r) => patch({ role: r as MemberRole }, "Role updated")}>
        <SelectTrigger
          size="sm"
          className="w-24 shrink-0 sm:w-28"
          aria-label={`Role for ${m.name || m.email}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {assignableRoles(myRole).map((r) => (
            <SelectItem key={r} value={r} className="capitalize">
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Tooltip
      content={
        lastOwner
          ? "Every business needs at least one owner."
          : isMe
            ? "You can't change your own role."
            : undefined
      }
    >
      <Badge tone={m.role === "owner" ? "brand" : "neutral"} className="capitalize">
        {m.role}
      </Badge>
    </Tooltip>
  );
}

/** Remove a member or revoke an invite; the last owner can't be removed. */
function RemoveControl({ member: m, lastOwner }: { member: TeamMember; lastOwner: boolean }) {
  const { business } = useBusinessContext();
  const remove = useRemoveTeamMember(business.id);
  if (lastOwner) {
    return (
      <Tooltip content="The last owner can't be removed.">
        <span>
          <IconButton label={`Remove ${m.name || m.email}`} disabled tooltip={false}>
            <Trash2 />
          </IconButton>
        </span>
      </Tooltip>
    );
  }
  const invited = m.status === "invited";
  return (
    <ConfirmDialog
      trigger={
        <IconButton label={invited ? `Revoke invite for ${m.email}` : `Remove ${m.name || m.email}`}>
          <Trash2 />
        </IconButton>
      }
      title={invited ? `Revoke the invite for ${m.email}?` : `Remove ${m.name || m.email}?`}
      description={
        invited
          ? "The invite link stops working."
          : "They lose access straight away. Their bookings and calendar stay."
      }
      confirmLabel={invited ? "Revoke" : "Remove"}
      destructive
      onConfirm={async () => {
        await withToast(() => remove.mutateAsync(m.id), invited ? "Invite revoked" : "Removed from the team");
      }}
    />
  );
}
