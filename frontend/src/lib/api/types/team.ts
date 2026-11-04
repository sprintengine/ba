/** API types: Team. Import them from `@/lib/api/types`. */
import type { MemberRole } from "./common";

export type TeamMember = {
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  role: MemberRole;
  status: "invited" | "active";
  resourceId: string | null;
  createdAt: string;
};

export type TeamInvitationInput = { email: string; role: MemberRole; resourceId?: string | null };
export type UpdateTeamMemberInput = { role?: MemberRole; resourceId?: string | null };
