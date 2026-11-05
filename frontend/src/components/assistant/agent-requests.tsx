"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Unplug } from "lucide-react";
import { AiBadge, LogoMark } from "@/components/brand/logo";
import {
  useAgentRequest,
  useAgentRequests,
  useApproveAgentRequest,
  useDeclineAgentRequest,
} from "@/lib/api/hooks";
import { qk } from "@/lib/api/query-keys";
import type { AgentRequest } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDateTime } from "@/lib/format";
import { BUSINESS_AI_HELP_PATH } from "@/lib/oauth/app-url";
import { ErrorState } from "@/components/common/feedback";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardWhere, ProposalView } from "./proposal-card";

/**
 * One of the member's AI apps' proposals (§20.8): what it would change, from which app, with Approve and Decline.
 * Approving carries it out here, signed in: the app can't do that itself.
 */
export function AgentRequestCard({
  request,
  headingLevel = 3,
}: {
  request: AgentRequest;
  headingLevel?: 2 | 3;
}) {
  const business = useCurrentBusiness();
  const qc = useQueryClient();
  // Refused because it changed since it was prepared (or can't go ahead): show it as it is now.
  const reload = () => void qc.invalidateQueries({ queryKey: qk.business(business.id).agentRequests() });
  const approve = useApproveAgentRequest(business.id, { onError: reload });
  const decline = useDeclineAgentRequest(business.id);
  const { action, app } = request;
  const pending = action.status === "pending";

  return (
    <div className="flex flex-col gap-2">
      <p>
        <AiBadge>
          From {app} · {formatDateTime(action.createdAt, business.timezone, business.locale)}
        </AiBadge>
      </p>
      <ProposalView
        action={action}
        confirm={approve}
        reject={decline}
        canDecide={!request.appDisconnected}
        headingLevel={headingLevel}
        retryHint={`Ask ${app} to try again.`}
        where={dashboardWhere(business)}
      />
      {pending && request.appDisconnected && (
        <p className="flex gap-1.5 text-sm text-muted-foreground">
          <Unplug className="mt-0.5 size-4 shrink-0" aria-hidden /> {app} was disconnected, so this
          can&rsquo;t go ahead.
        </p>
      )}
      {pending && !request.needsApproval && !request.appDisconnected && (
        <p className="text-sm text-muted-foreground">
          Your business lets agents make this kind of change, so {app} can also go ahead once you say yes
          there.
        </p>
      )}
      {action.status === "confirmed" && (
        <p className="flex gap-1.5 text-sm text-muted-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> You can go back to {app}: it can see
          that this went ahead.
        </p>
      )}
    </div>
  );
}

/** `/dashboard/[slug]/approvals/[id]`: where an AI app sends the member to approve one change (its `approvalUrl`). */
export function AgentRequestPage({ id }: { id: string }) {
  const business = useCurrentBusiness();
  const request = useAgentRequest(business.id, id);
  const app = request.data?.app ?? "Your AI agent";

  return (
    <PageContainer size="default">
      <PageHeader
        back={{ href: dashboardHref(business.slug, "approvals"), label: "Approvals" }}
        title="Approve a change"
        description={
          request.data?.needsApproval === false
            ? `${app} wants to make this change at ${business.name}.`
            : `${app} wants to make this change at ${business.name}. Nothing happens until you approve it.`
        }
      />
      {request.isError ? (
        <ErrorState headingLevel={2} error={request.error} onRetry={() => request.refetch()} />
      ) : request.data ? (
        <AgentRequestCard request={request.data} headingLevel={2} />
      ) : (
        <Skeleton className="h-56 rounded-xl" />
      )}
    </PageContainer>
  );
}

/** `/dashboard/[slug]/approvals`: every change the member's AI agents asked to make here in the last week. */
export function AgentRequestsPage() {
  const business = useCurrentBusiness();
  const requests = useAgentRequests(business.id);
  const items = requests.data ?? [];
  const waiting = items.filter((r) => r.action.status === "pending");
  const decided = items.filter((r) => r.action.status !== "pending");

  return (
    <PageContainer size="default">
      <PageHeader
        title="Approvals"
        description="What your AI agents asked to change here, and what happened."
      />
      {requests.isError ? (
        <ErrorState headingLevel={2} error={requests.error} onRetry={() => requests.refetch()} />
      ) : requests.isPending ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : items.length === 0 ? (
        <div>
          <EmptyState
            headingLevel={2}
            icon={<LogoMark mono title="" />}
            title="Nothing to approve"
            description="When your AI agent (Claude, ChatGPT and others) prepares a change here, it appears for you to approve."
            action={
              <Button asChild variant="secondary">
                <Link href={BUSINESS_AI_HELP_PATH}>Connect your agent</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {waiting.length > 0 && (
            <section aria-labelledby="approvals-waiting" className="flex flex-col gap-4">
              <h2 id="approvals-waiting" className="text-sm font-semibold">
                Waiting for you
              </h2>
              {waiting.map((r) => (
                <AgentRequestCard key={r.action.id} request={r} />
              ))}
            </section>
          )}
          {decided.length > 0 && (
            <section aria-labelledby="approvals-decided" className="flex flex-col gap-4">
              <h2 id="approvals-decided" className="text-sm font-semibold">
                This week
              </h2>
              {decided.map((r) => (
                <AgentRequestCard key={r.action.id} request={r} />
              ))}
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}
