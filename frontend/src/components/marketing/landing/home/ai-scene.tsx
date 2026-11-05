"use client";

import { useRef, useState } from "react";
import { ArrowUp, Check, Loader, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { IPhone } from "./iphone";
import { SceneToggle } from "./scene-parts";
import { useScene } from "./use-scene";

const STEPS = [1100, 1500, 2300, 1000, 4600] as const;

type Script = {
  ask: string;
  working: string;
  reply: string;
  card: { title: string; sub: string; chips?: string[]; rows: [string, string][] };
  action: string;
  done: string;
};

const SCRIPTS = {
  customer: {
    ask: "Book me a sports massage on Thursday, any time after 3.",
    working: "Checking times at Lumen Physiotherapy",
    reply: "Sam is free on Thursday at these times.",
    card: {
      title: "Sports massage",
      sub: "Lumen Physiotherapy · 45 minutes",
      chips: ["15:30", "16:15"],
      rows: [
        ["With", "Sam Rivers"],
        ["Price", "€45"],
      ],
    },
    action: "Book and pay €45",
    done: "You're booked and paid. It's on their calendar, and a reminder is set for Wednesday.",
  },
  owner: {
    ask: "Sam's off on Friday afternoon. Can you sort out their bookings?",
    working: "Looking at Friday's calendar",
    reply: "Aoife is free for all three. Here's what I'd change.",
    card: {
      title: "Move three bookings to Aoife",
      sub: "Friday afternoon · same times",
      rows: [
        ["14:00", "Toby Marsh"],
        ["15:00", "Avery Lane"],
        ["16:15", "Casey Rowe"],
      ],
    },
    action: "Approve changes",
    done: "Done. All three are moved and each client has been told.",
  },
} satisfies Record<string, Script>;

export type AiScript = keyof typeof SCRIPTS;

function Chat({ script }: { script: AiScript }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const step = useScene(ref, STEPS, paused);
  const s: Script = SCRIPTS[script];

  return (
    <div ref={ref} className="flex flex-col items-center gap-5 [--iphone-scale:0.76] lg:[--iphone-scale:0.8]">
      <div aria-hidden inert>
        <IPhone time="15:14">
          <div className="absolute inset-0 flex flex-col bg-surface pt-[3.375rem] text-left">
            <p className="py-3 text-center text-[1.0625rem] font-semibold">Assistant</p>
            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-4 pb-4 text-[1.0625rem] leading-[1.4]">
              <p className="ml-10 self-end rounded-[1.375rem] rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
                {s.ask}
              </p>
              {step >= 1 && (
                <p className="flex animate-fade-in items-center gap-2 text-[0.9375rem] text-muted-foreground">
                  {step === 1 ? <Loader className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {s.working}
                </p>
              )}
              {step >= 2 && (
                <div className="flex animate-rise flex-col gap-3">
                  <p>{s.reply}</p>
                  <div className="rounded-[1.25rem] border border-border bg-background p-4 shadow-sm">
                    <p className="font-semibold">{s.card.title}</p>
                    <p className="text-[0.9375rem] text-muted-foreground">{s.card.sub}</p>
                    {s.card.chips && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {s.card.chips.map((c, i) => (
                          <span
                            key={c}
                            className={cn(
                              "tnum rounded-lg border py-2.5 text-center text-[0.9375rem] font-medium",
                              i === 0
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-surface",
                            )}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    <dl className="mt-3 flex flex-col gap-1.5 text-[0.9375rem]">
                      {s.card.rows.map(([a, b]) => (
                        <div key={a} className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{a}</dt>
                          <dd className="tnum font-medium">{b}</dd>
                        </div>
                      ))}
                    </dl>
                    <span
                      className={cn(
                        "mt-3.5 flex items-center justify-center gap-1.5 rounded-xl py-3 font-semibold transition-colors",
                        step >= 3
                          ? "bg-success-soft text-success-soft-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {step >= 3 ? (
                        <>
                          <Check className="size-4.5" /> Confirmed
                        </>
                      ) : (
                        s.action
                      )}
                    </span>
                  </div>
                </div>
              )}
              {step >= 4 && <p className="animate-fade-in">{s.done}</p>}
            </div>
            <div className="mx-3 mb-9 flex h-12 shrink-0 items-center gap-2.5 rounded-full bg-muted pr-1.5 pl-4 text-muted-foreground">
              <Plus className="size-5" />
              <span className="flex-1 text-[1.0625rem]">Ask anything</span>
              <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
                <ArrowUp className="size-5" />
              </span>
            </div>
          </div>
        </IPhone>
      </div>
      <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />
    </div>
  );
}

const TABS: { key: AiScript; label: string }[] = [
  { key: "owner", label: "For your business" },
  { key: "customer", label: "For your customers" },
];

/** The two sides of the AI story, one phone each: the owner's assistant, and a customer's. */
export function AiScene({
  heading,
  children,
}: {
  heading: React.ReactNode;
  children: Record<AiScript, React.ReactNode>;
}) {
  const [tab, setTab] = useState<AiScript>("owner");
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-24">
      <div>
        {heading}
        <div
          role="group"
          aria-label="Who the assistant works for"
          className="mt-10 inline-flex gap-1 rounded-xl bg-muted p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "focus-ring rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors pointer-coarse:min-h-11",
                tab === t.key && "bg-surface text-foreground shadow-xs",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-7">{children[tab]}</div>
      </div>
      <Chat key={tab} script={tab} />
    </div>
  );
}
