/** Pure helpers for the Team screen (the website's team-view.tsx and member-row.tsx rules). */
import type { MemberRole, Resource, TeamMember } from "@shared/api/types";
import { roleRank } from "@shared/business/permissions";

/** Active members first (owners, then admins, then staff, by name), invitations after. */
export function sortMembers(members: readonly TeamMember[]): TeamMember[] {
  return [...members].sort(
    (a, b) =>
      Number(a.status === "invited") - Number(b.status === "invited") ||
      roleRank(b.role) - roleRank(a.role) ||
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}

export type TeamRow =
  { kind: "header"; key: string; title: string } | { kind: "member"; key: string; member: TeamMember };

/** The list's rows: members, then a "Pending invitations" section when there are any. */
export function teamRows(members: readonly TeamMember[]): TeamRow[] {
  const sorted = sortMembers(members);
  const active = sorted.filter((m) => m.status !== "invited");
  const invited = sorted.filter((m) => m.status === "invited");
  const rows: TeamRow[] = active.map((member) => ({ kind: "member", key: member.id, member }));
  if (invited.length > 0) {
    rows.push({ kind: "header", key: "invited", title: "Pending invitations" });
    rows.push(...invited.map((member): TeamRow => ({ kind: "member", key: member.id, member })));
  }
  return rows;
}

/** How many active owners: the last one can't be removed, demoted or leave (the backend refuses too). */
export function activeOwners(members: readonly TeamMember[]): number {
  return members.filter((m) => m.role === "owner" && m.status === "active").length;
}

export function isLastOwner(member: TeamMember, members: readonly TeamMember[]): boolean {
  return member.role === "owner" && member.status === "active" && activeOwners(members) <= 1;
}

/** Calendars a member can be linked to: active people (not rooms or equipment). */
export function linkablePeople(resources: readonly Resource[] | undefined): { id: string; name: string }[] {
  return (resources ?? [])
    .filter((r) => r.kind === "person" && r.isActive)
    .map(({ id, name }) => ({ id, name }));
}

/** Whether `myRole` may change or remove `member` (an owner only by an owner: `manageOwners`). */
export function canManageMember(
  member: TeamMember,
  perms: { manageTeam: boolean; manageOwners: boolean },
): boolean {
  return perms.manageTeam && (member.role !== "owner" || perms.manageOwners);
}

/** "Alex Morgan" → "AM". */
export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || fallback;
}

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", staff: "Staff" };

/** Why a member's role can't be changed here, or null when it can. */
export function roleLockReason(opts: {
  isMe: boolean;
  lastOwner: boolean;
  canManage: boolean;
}): string | null {
  if (opts.lastOwner) return "Every business needs at least one owner.";
  if (opts.isMe) return "You can't change your own role.";
  if (!opts.canManage) return "Only an owner can change an owner.";
  return null;
}
