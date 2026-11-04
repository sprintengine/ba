"use client";

import { useState } from "react";
import { Check, ShieldCheck, UserPlus } from "lucide-react";
import { useResources, useTeam } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { ActionButton } from "@/components/ui/action-button";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { roleInfo, roleRank } from "@/lib/business/permissions";
import { InviteDialog } from "./invite-dialog";
import { MemberRow } from "./member-row";

export function TeamView() {
  const { business, role, me } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const team = useTeam(business.id);
  const resources = useResources(business.id);
  const [inviting, setInviting] = useState(false);
  const info = roleInfo(v);
  const members = [...(team.data ?? [])].sort(
    (a, b) =>
      Number(a.status === "invited") - Number(b.status === "invited") ||
      roleRank(b.role) - roleRank(a.role) ||
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
  const owners = members.filter((m) => m.role === "owner" && m.status === "active").length;
  const people = (resources.data ?? []).filter((r) => r.kind === "person" && r.isActive);

  return (
    <PageContainer size="default">
      <PageHeader
        title="Team"
        description="Invite people and choose what they can do."
        actions={
          perms.manageTeam && (
            <ActionButton
              variant="primary"
              onClick={() => setInviting(true)}
              icon={<UserPlus />}
              label="Invite"
            />
          )
        }
      />
      {team.isError ? (
        <ErrorState error={team.error} onRetry={() => team.refetch()} headingLevel={2} />
      ) : (
        <div className="flex flex-col gap-10">
          <ul
            aria-label="Team members"
            aria-busy={team.isPending || undefined}
            className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
          >
            {team.isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </li>
                ))
              : members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isMe={m.userId === me.user.id}
                    myRole={role}
                    lastOwner={m.role === "owner" && m.status === "active" && owners <= 1}
                    people={people}
                    canManage={perms.manageTeam && (m.role !== "owner" || perms.manageOwners)}
                  />
                ))}
          </ul>

          <section>
            <SectionHeader
              title="Roles"
              description="What each role can do. Everyone can see the whole team."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {(["owner", "admin", "staff"] as const).map((r) => (
                <div
                  key={r}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-xs"
                >
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-brand" /> {info[r].label}
                  </h3>
                  <p className="text-sm text-muted-foreground">{info[r].summary}</p>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {info[r].can.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {inviting && <InviteDialog open onOpenChange={setInviting} people={people} />}
    </PageContainer>
  );
}
