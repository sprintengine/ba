"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CircleCheck, Unplug } from "lucide-react";
import { qk } from "@/lib/api/query-keys";
import {
  useApproveMyAgentRequest,
  useDeclineMyAgentRequest,
  useMyAgentRequest,
  useMyAgentRequests,
} from "@/lib/api/hooks";
import type { CustomerAgentRequest } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { AI_HELP_PATH, CONNECTED_APPS_PATH } from "@/lib/oauth/app-url";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalView } from "@/components/assistant/proposal-card";

/** Where the customer sees every request their AI apps made. */
export const MY_APPROVALS_PATH = "/my/approvals";

/**
 * One of the customer's AI apps' requests (§20.8): what it would do, from which app, with Approve and Decline.
 * Approving books, moves or cancels here, signed in: the app can't do that itself.
 */
export function CustomerRequestCard({
  request,
  headingLevel = 3,
}: {
  request: CustomerAgentRequest;
  headingLevel?: 2 | 3;
}) {
  const qc = useQueryClient();
  // Refused because it changed since it was prepared (or can't go ahead): show it as it is now.
  const reload = () => void qc.invalidateQueries({ queryKey: qk.myAgentRequests() });
  const approve = useApproveMyAgentRequest({ onError: reload });
  const decline = useDeclineMyAgentRequest();
  const { action, app } = request;
  const pending = action.status === "pending";

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="size-3.5" aria-hidden /> From {app} ·{" "}
        {formatDateTime(action.createdAt, request.timezone)}
      </p>
      <ProposalView
        action={action}
        confirm={approve}
        reject={decline}
        canDecide={!request.appDisconnected}
        headingLevel={headingLevel}
        retryHint={`Ask ${app} to try again.`}
        where={{ timezone: request.timezone, href: (path) => path }}
      />
      {pending && request.appDisconnected && (
        <p className="flex gap-1.5 text-sm text-muted-foreground">
          <Unplug className="mt-0.5 size-4 shrink-0" aria-hidden /> {app} was disconnected, so this
          can&rsquo;t go ahead.
        </p>
      )}
      {pending && !request.needsApproval && !request.appDisconnected && (
        <p className="text-sm text-muted-foreground">
          You let your AI apps make this kind of change, so {app} can also go ahead once you say yes there.
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

/** `/my/approvals/[id]`: where a customer's AI app sends them to approve one request (its `approvalUrl`). */
export function CustomerRequestPage({ id }: { id: string }) {
  const request = useMyAgentRequest(id);
  const app = request.data?.app ?? "Your AI assistant";
  const where = request.data ? ` with ${request.data.business.name}` : "";

  return (
    <>
      <PageHeader
        back={{ href: MY_APPROVALS_PATH, label: "Approvals" }}
        title="Approve a request"
        description={
          request.data?.needsApproval === false
            ? `${app} wants to do this${where}.`
            : `${app} wants to do this${where}. Nothing happens until you approve it.`
        }
      />
      {request.isError ? (
        <ErrorState headingLevel={2} error={request.error} onRetry={() => request.refetch()} />
      ) : request.data ? (
        <CustomerRequestCard request={request.data} headingLevel={2} />
      ) : (
        <Skeleton className="h-56 rounded-xl" />
      )}
    </>
  );
}

/** `/my/approvals`: what the customer's AI apps asked to do in the last week, waiting ones first. */
export function CustomerRequestsPage() {
  const requests = useMyAgentRequests();
  const items = requests.data ?? [];
  const waiting = items.filter((r) => r.action.status === "pending");
  const decided = items.filter((r) => r.action.status !== "pending");

  return (
    <>
      <PageHeader
        back={{ href: "/my/bookings", label: "My bookings" }}
        title="Approvals"
        description="What your AI assistants asked to book, move or cancel for you, and whether it went ahead."
        actions={
          <Button asChild variant="secondary">
            <Link href={CONNECTED_APPS_PATH}>Connected apps</Link>
          </Button>
        }
      />
      {requests.isError ? (
        <ErrorState headingLevel={2} error={requests.error} onRetry={() => requests.refetch()} />
      ) : requests.isPending ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            headingLevel={2}
            icon={<Bot />}
            title="Nothing to approve"
            description="Anything waiting for your OK appears here."
            action={
              <Button asChild variant="secondary">
                <Link href={AI_HELP_PATH}>Use bookanything in your AI assistant</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {waiting.length > 0 && (
            <section aria-labelledby="my-approvals-waiting" className="flex flex-col gap-4">
              <h2 id="my-approvals-waiting" className="text-sm font-semibold">
                Waiting for you
              </h2>
              {waiting.map((r) => (
                <CustomerRequestCard key={r.action.id} request={r} />
              ))}
            </section>
          )}
          {decided.length > 0 && (
            <section aria-labelledby="my-approvals-decided" className="flex flex-col gap-4">
              <h2 id="my-approvals-decided" className="text-sm font-semibold">
                This week
              </h2>
              {decided.map((r) => (
                <CustomerRequestCard key={r.action.id} request={r} />
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
