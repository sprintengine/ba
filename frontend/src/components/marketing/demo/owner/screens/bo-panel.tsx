"use client";

import { ArrowRight, ArrowUp, Brain, Check, CircleCheck, Clock, House, SquarePen, X } from "lucide-react";
import { BoCharacter } from "@/components/assistant/bo-character";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { DemoCaret, useDemoTarget } from "../../engine/demo-context";
import type { ChatMessage, OwnerState } from "../state";

function Proposal({ status }: { status: "pending" | "confirmed" }) {
  const confirm = useDemoTarget("bo-confirm");
  const pending = status === "pending";
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-3.5 shadow-xs",
        pending ? "border-brand-border" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Move appointment</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            BA-4FJ9TC · Follow-up treatment for Toby Marsh to Fri 2 Oct, 10:00–10:45
          </p>
        </div>
        <Badge tone={pending ? "info" : "success"} className="shrink-0">
          {pending ? "Needs your OK" : "Done"}
        </Badge>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">When</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          <del className="text-subtle-foreground decoration-subtle-foreground/60">Thu 1 Oct, 09:30–10:15</del>
          <ArrowRight className="size-3.5 text-subtle-foreground" />
          <span className="font-medium">Fri 2 Oct, 10:00–10:45</span>
        </dd>
        <dt className="text-muted-foreground">Client email</dt>
        <dd className="font-medium">Yes</dd>
      </dl>
      {pending ? (
        <div className="flex items-center gap-2">
          <Button
            {...confirm.props}
            tabIndex={-1}
            size="sm"
            variant="primary"
            className={cn(confirm.hovered && "bg-primary-hover", confirm.pressed && "scale-[0.97]")}
          >
            Move it
          </Button>
          <Button tabIndex={-1} size="sm" variant="ghost">
            Decline
          </Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-subtle-foreground">
            <Clock className="size-3" /> until 11:35
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
          <CircleCheck className="size-4 shrink-0" /> Moved BA-4FJ9TC to Fri 2 Oct, 10:00–10:45.
        </div>
      )}
    </section>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user")
    return (
      <p className="ml-auto max-w-[85%] animate-rise rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        {m.text}
      </p>
    );
  if (m.role === "proposal") return <Proposal status={m.status} />;
  return (
    <div className="flex animate-rise flex-col gap-2">
      {m.tools && (
        <div className="flex flex-wrap gap-1.5">
          {m.tools.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
            >
              <Check className="size-3 text-brand" /> {t}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm leading-6">{m.text}</p>
    </div>
  );
}

function Home() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-semibold tracking-tight">Good morning, Avery.</p>
        <p className="text-sm text-muted-foreground">Ask me to move, book or check anything.</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
          Quick actions
        </span>
        <div className="flex flex-wrap gap-2">
          {["What's on today?", "Find a free slot", "Block time off", "How was last week?"].map((q) => (
            <span key={q} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium">
              {q}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Bo's panel: header, the conversation (or home), and the composer. */
export function BoPanel({ bo }: { bo: OwnerState["bo"] }) {
  const composer = useDemoTarget("bo-input");
  const send = useDemoTarget("bo-send");
  const mood = bo.thinking ? "thinking" : composer.focused && !bo.messages.length ? "listening" : "idle";
  return (
    <>
      <div className="border-b border-border-subtle px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <BoCharacter mood={mood} size={34} />
          <span className="flex flex-col">
            <span className="text-sm leading-5 font-semibold">Bo</span>
            <span className="text-xs text-muted-foreground">862 AI credits left</span>
          </span>
          <X className="ml-auto size-4 text-muted-foreground" />
        </div>
        <div className="mt-3 flex items-center gap-1 text-sm font-medium">
          <span className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1">
            <House className="size-4" /> Home
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground">
            <Brain className="size-4" /> Memory
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground">
            <SquarePen className="size-4" /> New chat
          </span>
          <span className="ml-auto flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>J</Kbd>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden px-5 py-5">
        {bo.messages.length === 0 ? <Home /> : bo.messages.map((m, i) => <Message key={i} m={m} />)}
        {bo.thinking && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <BoCharacter mood="thinking" size={22} /> Checking the calendar…
          </span>
        )}
      </div>
      <div className="border-t border-border-subtle p-4">
        <div
          {...composer.props}
          className={cn(
            "flex items-center gap-2 rounded-xl border border-input bg-surface py-2 pr-2 pl-3.5 text-sm shadow-xs",
            composer.focused && "border-ring ring-3 ring-ring/20",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !bo.input && "text-subtle-foreground")}>
            {bo.input || (composer.focused ? "" : "Ask Bo anything…")}
            {composer.focused && <DemoCaret />}
          </span>
          <span
            {...send.props}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              bo.input ? "bg-primary text-primary-foreground" : "bg-muted text-subtle-foreground",
            )}
          >
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>
    </>
  );
}
