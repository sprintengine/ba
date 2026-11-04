"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CircleAlert, Scissors, ShieldAlert } from "lucide-react";
import type { AssistantNotice, ChatMessage } from "@/lib/api/types";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import type { ChatError } from "@/lib/assistant/chat-state";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistant } from "./assistant-context";
import { BoCharacter } from "./bo-character";
import { ProposalCard } from "./proposal-card";
import { QuickActions } from "./quick-action-list";
import { RichText } from "./rich-text";
import { ToolActivityList } from "./tool-activity";

const NOTICE_ICON = { refusal: ShieldAlert, truncated: Scissors, error: CircleAlert } as const;

function Notice({ notice }: { notice: AssistantNotice }) {
  const Icon = NOTICE_ICON[notice.kind];
  return (
    <p
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2 text-sm",
        notice.kind === "refusal"
          ? "bg-muted text-muted-foreground"
          : "bg-warning-soft text-warning-soft-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> {notice.message}
    </p>
  );
}

function Bubble({
  message,
  live,
  onNavigate,
}: {
  message: ChatMessage;
  live: boolean;
  onNavigate: () => void;
}) {
  const { chat } = useAssistant();
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.text}
        </p>
        <span className="sr-only">You said</span>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2.5" aria-busy={live || undefined}>
      <span className="sr-only">{ASSISTANT_NAME} said</span>
      <ToolActivityList tools={message.tools} />
      {message.text && (
        <div className="max-w-[95%] text-sm leading-6 text-foreground">
          <RichText text={message.text} />
        </div>
      )}
      {message.actions.map((a) => (
        <ProposalCard key={a.id} action={a} onUpdated={chat.actionUpdated} onNavigate={onNavigate} />
      ))}
      {message.notice && <Notice notice={message.notice} />}
    </li>
  );
}

/** Copy for a turn refused before it started (or stopped without a notice), with the way out. */
function TurnError({ error }: { error: ChatError }) {
  const business = useCurrentBusiness();
  const { manageBilling } = usePermissions();
  const limit = error.code === "AI_LIMIT_REACHED";
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-xl border border-warning-border bg-warning-soft px-3.5 py-3 text-sm text-warning-soft-foreground"
    >
      <p className="font-medium">
        {limit
          ? "Out of AI credits for this month"
          : error.code === "AI_NOT_CONFIGURED"
            ? "AI isn't set up yet"
            : "That didn't go through"}
      </p>
      <p>{error.message}</p>
      {limit && manageBilling && (
        <Link
          href={dashboardHref(business.slug, "settings/billing")}
          className="font-medium underline underline-offset-2"
        >
          See usage and plans
        </Link>
      )}
    </div>
  );
}

/** The conversation log (a live region), with Bo's thinking indicator and errors. Scrolls to the newest. */
export function ChatMessages({ onNavigate }: { onNavigate: () => void }) {
  const { chat, mood } = useAssistant();
  const end = useRef<HTMLDivElement>(null);
  const { messages, state } = chat;
  const lastText = messages.at(-1)?.text;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastText, state.status]);

  if (chat.loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="ml-auto h-9 w-2/3 rounded-2xl" />
        <Skeleton className="h-20 w-5/6 rounded-xl" />
      </div>
    );
  }
  // A request refused before it started, or a finished turn that failed without a notice in the chat saying so.
  const error = state.error;
  const failed =
    error && (error.during === "request" || (state.status === "idle" && !messages.at(-1)?.notice))
      ? error
      : null;
  if (messages.length === 0 && !failed) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <BoCharacter mood={mood} size={72} />
        <p className="text-sm font-medium">What can I help with?</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Ask about your schedule, find a free slot, or tell me what to change. I&apos;ll show you every
          change before it happens.
        </p>
        <QuickActions className="justify-center" onNavigate={onNavigate} />
      </div>
    );
  }
  const waiting =
    state.status === "sending" ||
    (state.status === "streaming" && !state.pending?.reply.text && !state.pending?.reply.tools.length);
  return (
    <div className="flex flex-col gap-5">
      {/* The log wraps the list: a role on the <ol> itself would drop its list semantics and orphan the items. */}
      {/* Busy while a reply streams in, so screen readers read the finished reply once instead of every chunk. */}
      <div
        role="log"
        aria-live="polite"
        aria-busy={chat.busy}
        aria-label={`Conversation with ${ASSISTANT_NAME}`}
      >
        <ol className="flex flex-col gap-5">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} live={m.id === "live-reply"} onNavigate={onNavigate} />
          ))}
        </ol>
      </div>
      {waiting && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <BoCharacter mood="thinking" size={28} /> {ASSISTANT_NAME} is thinking…
        </p>
      )}
      {failed && <TurnError error={failed} />}
      <div ref={end} />
    </div>
  );
}
