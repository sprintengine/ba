"use client";

import { ArrowUp, Check, Plus } from "lucide-react";
import type { AssistantAction, ToolActivity } from "@/lib/api/types";
import { NOTHING_HEARD } from "@/lib/assistant/dictation";
import type { Dictation } from "@/lib/assistant/use-dictation";
import { cn } from "@/lib/utils";
import { Composer } from "@/components/assistant/composer";
import { ProposalView } from "@/components/assistant/proposal-card";
import { ToolActivityList } from "@/components/assistant/tool-activity";
import { LUMEN } from "./fixture";
import { SCENE_CHAT } from "./scene-parts";

const noop = () => undefined;
const WHERE = { timezone: LUMEN.timezone, locale: LUMEN.locale, href: (path: string) => path };
const idle = { mutate: noop, isPending: false };
const OFF: Dictation = {
  supported: false,
  listening: false,
  heard: NOTHING_HEARD,
  error: null,
  start: noop,
  stop: noop,
  cancel: noop,
  clearError: noop,
};

const MOVE: AssistantAction = {
  id: "sample-move",
  tool: "reschedule_bookings",
  status: "pending",
  error: null,
  result: null,
  expiresAt: "2026-11-05T15:44:00Z",
  createdAt: "2026-11-05T15:14:00Z",
  decidedAt: null,
  proposal: {
    title: "Move three bookings to Aoife",
    summary: "Friday afternoon, same times",
    changes: [{ label: "With", before: "Sam Rivers", after: "Aoife Byrne" }],
    items: [
      { title: "14:00 · Remy Stroud", detail: "Follow-up treatment" },
      { title: "15:00 · Dara Quinn", detail: "Sports massage" },
      { title: "16:15 · Jo Hayes", detail: "Initial assessment" },
    ],
    warnings: [],
    confirmLabel: "Move all three",
    destructive: false,
  },
};
const MOVED: AssistantAction = {
  ...MOVE,
  status: "confirmed",
  result: { message: "All three moved, and each client has been told.", links: [] },
};

/** The move on the first screen: the client who has just booked, to the colleague who's free at the same time. */
const COVER: AssistantAction = {
  ...MOVE,
  id: "sample-cover",
  proposal: {
    title: "Move Rory Kane to Aoife",
    summary: "Today, same time",
    changes: [{ label: "With", before: "Sam Rivers", after: "Aoife Byrne" }],
    items: [{ title: "15:30 · Rory Kane", detail: "Follow-up treatment" }],
    warnings: [],
    confirmLabel: "Move booking",
    destructive: false,
  },
};
const COVERED: AssistantAction = {
  ...COVER,
  status: "confirmed",
  result: { message: "Moved, and Rory has been told.", links: [] },
};

/** The chat as the visitor would read it: a plain window, at the size the words are read at. */
function Chrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        SCENE_CHAT,
        "flex flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-[0_0_0_0.5px_rgb(20_16_60/0.3),0_24px_48px_-20px_rgb(20_16_60/0.4)]",
      )}
    >
      <p className="shrink-0 border-b border-border-subtle py-3 text-center text-[0.9375rem] font-semibold">
        {title}
      </p>
      {children}
    </div>
  );
}

function Mine({ children, theirs = false }: { children: React.ReactNode; theirs?: boolean }) {
  return (
    <p
      className={cn(
        "ml-10 self-end rounded-2xl rounded-br-md px-3.5 py-2",
        theirs ? "bg-muted text-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {children}
    </p>
  );
}

/** The owner's phone: the assistant's own activity chips, proposal card and message box, on a sample conversation. */
export function OwnerChat({ step }: { step: number }) {
  const tools: ToolActivity[] = [
    {
      id: "friday",
      name: "get_calendar",
      label: "Looking at Friday’s calendar",
      status: step === 0 ? "running" : "done",
      summary: "Looked at Friday’s calendar",
    },
  ];
  return (
    <Chrome title="Your assistant">
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_1.75rem)] px-4 pt-4 text-[0.9375rem] leading-6">
        <Mine>Who hasn’t paid this week?</Mine>
        <p>Everyone but Jo Hayes. €70 is due for Thursday.</p>
        <Mine>Sam’s off on Friday afternoon. Can you sort out their bookings?</Mine>
        <ToolActivityList tools={tools} />
        {step >= 1 && (
          <div className="flex animate-rise flex-col gap-3">
            <p>Aoife is free for all three. Here’s what I’d change.</p>
            <ProposalView
              action={step >= 3 ? MOVED : MOVE}
              confirm={{ mutate: noop, isPending: step === 2 }}
              reject={idle}
              retryHint=""
              where={WHERE}
            />
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 py-3">
        <Composer
          disabled={false}
          busy={false}
          onSend={noop}
          onTyping={noop}
          placeholder="Ask anything"
          dictation={OFF}
        />
      </div>
    </Chrome>
  );
}

/**
 * The owner's assistant on the first screen's phone, drawn up so it reads at the phone's small size: the payoff of the
 * tour. Steps as the AI section's: asked, then a proposal, then it's being approved, then done.
 */
export function TourChat({ step }: { step: number }) {
  const tools: ToolActivity[] = [
    {
      id: "today",
      name: "get_calendar",
      label: "Looking at today’s calendar",
      status: step === 0 ? "running" : "done",
      summary: "Looked at today’s calendar",
    },
  ];
  return (
    <div className="absolute inset-0 flex animate-fade-in flex-col bg-surface pt-[3.375rem] text-left">
      <p className="shrink-0 border-b border-border-subtle py-3 text-center text-xl font-semibold">
        Your assistant
      </p>
      <div className="flex min-h-0 flex-1 [zoom:1.32] flex-col gap-3 overflow-hidden px-3 pt-3 text-sm leading-[1.4]">
        <Mine>Sam has to leave early. Can you sort out Rory Kane?</Mine>
        <ToolActivityList tools={tools} />
        {step >= 1 && (
          <div className="flex animate-rise flex-col gap-2.5">
            <p>Aoife is free at the same time. Here’s what I’d change.</p>
            <ProposalView
              action={step >= 3 ? COVERED : COVER}
              confirm={{ mutate: noop, isPending: step === 2 }}
              reject={idle}
              retryHint=""
              where={WHERE}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** A client's phone: their own assistant, whichever it is, booking and paying with Lumen in the chat. */
export function ClientChat({ step }: { step: number }) {
  return (
    <Chrome title="Their assistant">
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_1.75rem)] px-4 pt-4 text-[0.9375rem] leading-6">
        <Mine theirs>Is there a physio near Lantern Quay I can book online?</Mine>
        <p>Lumen Physiotherapy, Unit 4, Lantern Quay. They take bookings here in the chat.</p>
        <Mine theirs>Book me a follow-up on Thursday, any time after 3.</Mine>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Check className="size-4" aria-hidden /> Checked times at Lumen Physiotherapy
        </p>
        {step >= 1 && (
          <div className="flex animate-rise flex-col gap-3">
            <p>Sam is free on Thursday at these times.</p>
            <div className="rounded-xl border border-border bg-background p-3.5 shadow-xs">
              <p className="font-semibold">Follow-up treatment</p>
              <p className="text-muted-foreground">Lumen Physiotherapy · 45 minutes</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {["15:30", "15:45"].map((c, i) => (
                  <span
                    key={c}
                    className={cn(
                      "tnum rounded-lg border py-2 text-center font-medium",
                      i === 0
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface",
                    )}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <dl className="mt-3 flex flex-col gap-1">
                {[
                  ["With", "Sam Rivers"],
                  ["Price", "€60"],
                ].map(([a, b]) => (
                  <div key={a} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{a}</dt>
                    <dd className="tnum font-medium">{b}</dd>
                  </div>
                ))}
              </dl>
              <span
                className={cn(
                  "mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-semibold transition-colors",
                  step >= 3
                    ? "bg-success-soft text-success-soft-foreground"
                    : "bg-primary text-primary-foreground",
                  step === 2 && "opacity-80",
                )}
              >
                {step >= 3 ? (
                  <>
                    <Check className="size-4" aria-hidden /> Booked and paid
                  </>
                ) : (
                  "Book and pay €60"
                )}
              </span>
            </div>
            {step >= 3 && (
              <p className="animate-fade-in">It’s on their calendar, and a reminder is set for Wednesday.</p>
            )}
          </div>
        )}
      </div>
      <div className="m-3 flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-muted pr-1.5 pl-4 text-muted-foreground">
        <Plus className="size-4.5" aria-hidden />
        <span className="flex-1 text-sm">Ask anything</span>
        <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
          <ArrowUp className="size-4.5" aria-hidden />
        </span>
      </div>
    </Chrome>
  );
}
