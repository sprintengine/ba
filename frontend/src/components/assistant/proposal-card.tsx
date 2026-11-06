"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, CircleSlash, Clock, TriangleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useConfirmAction, useRejectAction } from "@/lib/api/hooks";
import type { AssistantAction, AssistantActionStatus } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExamplePreview } from "@/components/ui/example-preview";

const STATUS: Record<
  AssistantActionStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  pending: { label: "Needs your OK", tone: "info" },
  confirmed: { label: "Done", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  failed: { label: "Didn't work", tone: "danger" },
};

/**
 * A proposal from Bo: every change and affected item, with Confirm and Decline. Nothing happens until Confirm; the
 * card then shows what was done (or why it failed) with links to see it.
 */
export function ProposalCard({
  action,
  onUpdated,
  onNavigate,
}: {
  action: AssistantAction;
  onUpdated: (a: AssistantAction) => void;
  onNavigate?: () => void;
}) {
  const business = useCurrentBusiness();
  const confirm = useConfirmAction(business.id, { onSuccess: onUpdated });
  const reject = useRejectAction(business.id, { onSuccess: onUpdated });
  return (
    <ProposalView
      action={action}
      confirm={confirm}
      reject={reject}
      retryHint="Ask Bo to try again."
      where={dashboardWhere(business)}
      onNavigate={onNavigate}
    />
  );
}

/** Where a proposal's times are shown and its result links go. */
export type ProposalWhere = {
  timezone: string;
  locale?: string;
  /** The href of a result link's path. */
  href: (path: string) => string;
};

/** A business's proposals: in its timezone, result links within its dashboard. */
export function dashboardWhere(business: { slug: string; timezone: string; locale: string }): ProposalWhere {
  return {
    timezone: business.timezone,
    locale: business.locale,
    href: (path) => dashboardHref(business.slug, path),
  };
}

/** What deciding a proposal takes: a confirm and a decline mutation keyed by the action id (Bo's, or an AI app's). */
type Decide = {
  mutate: (id: string, options: { onError: (err: unknown) => void }) => void;
  isPending: boolean;
};

/**
 * A proposal's card, whoever made it: [confirm] and [reject] decide it. [canDecide] false shows it without the
 * buttons (it can no longer go ahead); [retryHint] follows a failure.
 */
export function ProposalView({
  action,
  confirm,
  reject,
  retryHint,
  where,
  canDecide = true,
  headingLevel = 3,
  onNavigate,
}: {
  action: AssistantAction;
  confirm: Decide;
  reject: Decide;
  retryHint: string;
  where: ProposalWhere;
  canDecide?: boolean;
  /** The title's heading level: 3 under a section, 2 when the card is a page's content. */
  headingLevel?: 2 | 3;
  onNavigate?: () => void;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [error, setError] = useState<string | null>(null);
  const p = action.proposal;
  const pending = action.status === "pending";
  const titleId = `proposal-${action.id}`;

  const run = (m: Decide) => {
    setError(null);
    m.mutate(action.id, { onError: (err) => setError(errorMessage(err)) });
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-3.5 shadow-xs",
        pending ? (p.destructive ? "border-danger-border" : "border-brand-border") : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading id={titleId} className="text-sm font-semibold">
            {p.title}
          </Heading>
          <p className="mt-0.5 text-sm text-muted-foreground">{p.summary}</p>
        </div>
        <Badge tone={STATUS[action.status].tone} className="shrink-0">
          {STATUS[action.status].label}
        </Badge>
      </header>

      {p.changes.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {p.changes.map((c) => (
            <div key={c.label} className="contents">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="min-w-0">
                {c.before != null && c.after != null ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <del className="text-subtle-foreground decoration-subtle-foreground/60">{c.before}</del>
                    <ArrowRight className="size-3.5 text-subtle-foreground" aria-label="to" />
                    <span className="font-medium">{c.after}</span>
                  </span>
                ) : c.after != null ? (
                  <span className="font-medium">{c.after}</span>
                ) : (
                  <del className="text-subtle-foreground">{c.before}</del>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {p.items.length > 0 && (
        <ul
          className="flex max-h-56 flex-col divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle text-sm"
          aria-label="Affected"
        >
          {p.items.map((item, i) => (
            <li key={i} className="px-3 py-2">
              <p className="font-medium">{item.title}</p>
              {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      {pending && p.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-warning-soft-foreground">
          {p.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}

      {pending && canDecide && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={p.destructive ? "danger" : "primary"}
            loading={confirm.isPending}
            disabled={reject.isPending}
            onClick={() => run(confirm)}
          >
            {p.confirmLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reject.isPending}
            disabled={confirm.isPending}
            onClick={() => run(reject)}
          >
            Decline
          </Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-subtle-foreground">
            <Clock className="size-3" aria-hidden /> until{" "}
            {formatTime(action.expiresAt, where.timezone, where.locale)}
          </span>
        </div>
      )}

      {action.status === "confirmed" && action.result && (
        <div
          className="flex flex-col gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
          role="status"
        >
          <p className="flex gap-1.5">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {action.result.message}
          </p>
          {action.result.links.length > 0 && (
            <div className="flex flex-wrap gap-3 pl-5.5">
              {action.result.links.map((l) => (
                <Link
                  key={l.path}
                  href={where.href(l.path)}
                  onClick={onNavigate}
                  className="font-medium underline underline-offset-2"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <ClosedNote action={action} retryHint={retryHint} />
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Why a proposal that didn't go ahead is closed: it failed, expired or was declined. */
function ClosedNote({ action, retryHint }: { action: AssistantAction; retryHint: string }) {
  return (
    <>
      {action.status === "failed" && (
        <p className="flex gap-1.5 text-sm text-danger" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{" "}
          {action.error ?? "This couldn't be completed."} {retryHint}
        </p>
      )}
      {action.status === "expired" && (
        <p className="flex gap-1.5 text-sm text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> This proposal expired before it was
          confirmed, so nothing changed.
        </p>
      )}
      {action.status === "rejected" && (
        <p className="flex gap-1.5 text-sm text-muted-foreground">
          <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden /> Declined. Nothing changed.
        </p>
      )}
    </>
  );
}

const NOW = "2026-01-01T09:00:00Z";

/** Sample content for the real card, in the shape an assistant's request arrives in. */
const SAMPLE: AssistantAction = {
  id: "example",
  tool: "example",
  status: "pending",
  proposal: {
    title: "Move two bookings to Aoife",
    summary: "Sam is off on Friday afternoon, and Aoife is free at both times.",
    changes: [{ label: "With", before: "Sam", after: "Aoife" }],
    items: [
      { title: "15:30 · Rory", detail: "Follow-up" },
      { title: "16:15 · Jo", detail: "First visit" },
    ],
    warnings: [],
    confirmLabel: "Move both",
    destructive: false,
  },
  result: null,
  error: null,
  expiresAt: NOW,
  createdAt: NOW,
  decidedAt: null,
};

const INERT = { mutate: () => undefined, isPending: false };

/** What an assistant's request looks like when one arrives: the real card, dimmed, on a page with none yet. */
export function ExampleProposal({ where }: { where: ProposalWhere }) {
  return (
    <ExamplePreview>
      <ProposalView action={SAMPLE} confirm={INERT} reject={INERT} retryHint="" where={where} />
    </ExamplePreview>
  );
}
