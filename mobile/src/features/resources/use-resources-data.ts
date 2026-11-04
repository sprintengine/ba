import { useResources } from "@shared/api/hooks/use-resources";
import { useTeam } from "@shared/api/hooks/use-team";
import { useBusinessContext } from "@shared/business/business-context";
import { memberName, myMemberId, sortResources } from "./resources";

/**
 * What the list and a resource's screen both read (the website's ResourcesView): the resources in list order, the
 * team (for "Linked to …" and the signed-in member's id, which decides whether staff may edit a calendar's hours).
 */
export function useResourcesData() {
  const { business, me } = useBusinessContext();
  const resources = useResources(business.id);
  const team = useTeam(business.id);
  return {
    resources,
    team,
    list: sortResources(resources.data),
    myMemberId: myMemberId(team.data, me.user.id),
    memberName: (id: string | null) => memberName(team.data, id),
  };
}
