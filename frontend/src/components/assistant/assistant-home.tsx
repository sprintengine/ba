"use client";

import Link from "next/link";
import { ArrowUpRight, MessageSquare, PlugZap, Sparkles, X } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useDismissNudge } from "@/lib/api/hooks";
import type { Nudge } from "@/lib/api/types";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { formatRelativeDay, formatTime, greetingAt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreditsNotice } from "@/components/ai/credits";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";
import { useAssistant } from "./assistant-context";
import { QuickActions } from "./quick-action-list";

/** Shown instead of a chat when no AI model is connected (degraded mode: no fake answers). */
export function NotConfigured() {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface-sunken p-3.5 text-sm">
      <PlugZap className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
      <div>
        <p className="font-medium">AI isn&apos;t configured on this server</p>
        <p className="mt-0.5 text-muted-foreground">
          {ASSISTANT_NAME} can&apos;t answer questions until an AI model is connected. Your nudges and
          shortcuts below still work.
        </p>
      </div>
    </div>
  );
}

function NudgeCard({ nudge, onNavigate }: { nudge: Nudge; onNavigate: () => void }) {
  const { business } = useBusinessContext();
  const { ask, state } = useAssistant();
  const { manageAssistant } = usePermissions();
  const dismiss = useDismissNudge(business.id, { onError: (err) => toast.error(errorMessage(err)) });
  const canAsk = !!state?.configured && !state.credits.limitReached;
  return (
    <li
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border bg-surface p-3.5 shadow-xs",
        nudge.severity === "warning" ? "border-warning-border" : "border-border",
      )}
    >
      <div className="flex items-start gap-2 pr-6">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            nudge.severity === "warning" ? "bg-warning" : "bg-brand",
          )}
        />
        <div>
          <p className="text-sm font-medium">{nudge.title}</p>
          <p className="text-sm text-muted-foreground">{nudge.body}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-4">
        {canAsk && (
          <Button size="xs" variant="soft" onClick={() => ask(nudge.prompt)}>
            <Sparkles aria-hidden /> Ask {ASSISTANT_NAME}
          </Button>
        )}
        {nudge.action && (
          <Button size="xs" variant="ghost" asChild>
            <Link href={dashboardHref(business.slug, nudge.action.path)} onClick={onNavigate}>
              {nudge.action.label} <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
      {manageAssistant && (
        <IconButton
          label={`Dismiss: ${nudge.title}`}
          size="xs"
          className="absolute top-2.5 right-2.5"
          loading={dismiss.isPending}
          onClick={() => dismiss.mutate(nudge.id)}
        >
          <X />
        </IconButton>
      )}
    </li>
  );
}

/** Bo's home: a greeting, anything that needs attention, quick actions and recent conversations. */
export function AssistantHome({ onNavigate }: { onNavigate: () => void }) {
  const { business, me } = useBusinessContext();
  const { state, chat, setView } = useAssistant();
  const first = me.user.name?.split(" ")[0];
  const nudges = state?.nudges ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {greetingAt(new Date(), business.timezone)}
          {first ? `, ${first}` : ""}.
        </p>
        <p className="text-sm text-muted-foreground">
          {nudges.length > 0
            ? `${nudges.length === 1 ? "One thing needs" : `${nudges.length} things need`} a look.`
            : "All quiet. What can I do for you?"}
        </p>
      </div>
      {state && !state.configured && <NotConfigured />}
      {state?.configured && <CreditsNotice credits={chat.state.credits ?? state.credits} />}

      {nudges.length > 0 && (
        <section aria-labelledby="bo-nudges" className="flex flex-col gap-2.5">
          <h3 id="bo-nudges" className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
            Needs attention
          </h3>
          <ul className="flex flex-col gap-2.5">
            {nudges.map((n) => (
              <NudgeCard key={n.id} nudge={n} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="bo-quick" className="flex flex-col gap-2.5">
        <h3 id="bo-quick" className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
          Quick actions
        </h3>
        <QuickActions onNavigate={onNavigate} />
      </section>

      {!!state?.threads.length && (
        <section aria-labelledby="bo-recent" className="flex flex-col gap-1.5">
          <h3 id="bo-recent" className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
            Recent conversations
          </h3>
          <ul className="flex flex-col">
            {state.threads.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    chat.openThread(t.id);
                    setView("chat");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <MessageSquare className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t.title || "New conversation"}</span>
                  <span className="shrink-0 text-xs text-subtle-foreground">
                    {formatRelativeDay(t.updatedAt, business.timezone)}{" "}
                    {formatTime(t.updatedAt, business.timezone, business.locale)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
