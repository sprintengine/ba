import { api } from "./client";
import { businessPath, seg } from "./paths";
import type { TeamInvitationInput, TeamMember, UpdateTeamMemberInput } from "./types";

/** Team members and invitations (§6.7). */
export const teamApi = {
  list: (businessId: string): Promise<TeamMember[]> =>
    api.get<TeamMember[]>(businessPath(businessId, "/team")),

  /** Creates an `invited` member and sends the invite email. */
  invite: (businessId: string, body: TeamInvitationInput): Promise<TeamMember> =>
    api.post<TeamMember>(businessPath(businessId, "/team/invitations"), body),

  update: (businessId: string, memberId: string, body: UpdateTeamMemberInput): Promise<TeamMember> =>
    api.patch<TeamMember>(businessPath(businessId, `/team/${seg(memberId)}`), body),

  /** Fails with CONFLICT/POLICY_VIOLATION when removing the last owner. */
  remove: (businessId: string, memberId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/team/${seg(memberId)}`)),
};
