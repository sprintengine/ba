"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { teamApi } from "../team";
import type { TeamInvitationInput, TeamMember, UpdateTeamMemberInput } from "../types";
import {
  enabledWhen,
  invalidateAll,
  removeFromList,
  replaceInList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Members link to resources, and the caller's own role lives in `me`/business detail. */
const teamKeys = (businessId: string) => {
  const b = qk.business(businessId);
  return [b.team(), b.resources(), b.detail(), qk.me()];
};

export function useTeam(businessId: string, options?: QueryOptions<TeamMember[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).team(),
    queryFn: () => teamApi.list(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useInviteTeamMember(
  businessId: string,
  options?: MutationOptions<TeamMember, TeamInvitationInput>,
) {
  return useApiMutation(
    (input: TeamInvitationInput) => teamApi.invite(businessId, input),
    (qc) => invalidateAll(qc, teamKeys(businessId)),
    options,
  );
}

export type UpdateTeamMemberVariables = { id: string; input: UpdateTeamMemberInput };

export function useUpdateTeamMember(
  businessId: string,
  options?: MutationOptions<TeamMember, UpdateTeamMemberVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateTeamMemberVariables) => teamApi.update(businessId, id, input),
    (qc, member) => {
      replaceInList(qc, qk.business(businessId).team(), member);
      return invalidateAll(qc, teamKeys(businessId));
    },
    options,
  );
}

/** Variables: the member id. The last owner cannot be removed. */
export function useRemoveTeamMember(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => teamApi.remove(businessId, id),
    (qc, _data, id) => {
      removeFromList(qc, qk.business(businessId).team(), id);
      return invalidateAll(qc, teamKeys(businessId));
    },
    options,
  );
}
