"use client";

import { useRef, useState } from "react";
import { Check, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame, SceneToggle } from "./scene-parts";
import { useScene } from "./use-scene";

const STEPS = [1100, 1500, 2300, 1000, 4200] as const;

type Script = {
  ask: string;
  working: string;
  reply: string;
  card: { title: string; rows: [string, string][] };
  action: string;
  done: string;
};

const SCRIPTS = {
  customer: {
    ask: "Book me a sports massage on Thursday, any time after 3.",
    working: "Checking times at Lumen Physio",
    reply: "Thursday at 15:30 with Sam is free.",
    card: {
      title: "Sports massage",
      rows: [
        ["Thursday 5 Nov", "15:30"],
        ["With", "Sam"],
        ["Price", "€45"],
      ],
    },
    action: "Book and pay €45",
    done: "You're booked and paid. Lumen Physio has it on their calendar.",
  },
  owner: {
    ask: "Sam's off on Friday afternoon. Can you sort out their bookings?",
    working: "Looking at Friday's calendar",
    reply: "Aoife is free for all three. Here's what I'd change.",
    card: {
      title: "Move to Aoife",
      rows: [
        ["14:00", "Toby Marsh"],
        ["15:00", "Avery Lane"],
        ["16:15", "Casey Rowe"],
      ],
    },
    action: "Approve changes",
    done: "Done. All three are moved and their customers have been told.",
  },
} satisfies Record<string, Script>;

export type AiScript = keyof typeof SCRIPTS;

function Chat({ script }: { script: AiScript }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const step = useScene(ref, STEPS, paused);
  const s = SCRIPTS[script];

  return (
    <div ref={ref} className="flex flex-col items-center gap-4">
      <div aria-hidden inert className="w-full">
        <PhoneFrame className="mx-auto w-full max-w-[19rem]">
          <p className="px-4 pt-11 pb-3 text-center text-sm font-semibold">Your assistant</p>
          <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-3.5 pb-5 text-sm leading-snug">
            <p className="ml-8 self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground">
              {s.ask}
            </p>
            {step >= 1 && (
              <p className="flex animate-fade-in items-center gap-2 text-xs text-muted-foreground">
                {step === 1 ? <Loader className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {s.working}
              </p>
            )}
            {step >= 2 && (
              <div className="flex animate-rise flex-col gap-2.5">
                <p>{s.reply}</p>
                <div className="rounded-2xl border border-border bg-background p-3.5 shadow-sm">
                  <p className="font-semibold">{s.card.title}</p>
                  <dl className="mt-2 flex flex-col gap-1 text-xs">
                    {s.card.rows.map(([a, b]) => (
                      <div key={a} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{a}</dt>
                        <dd className="tnum font-medium">{b}</dd>
                      </div>
                    ))}
                  </dl>
                  <span
                    className={cn(
                      "mt-3 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[0.8125rem] font-semibold transition-colors",
                      step >= 3
                        ? "bg-success-soft text-success-soft-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {step >= 3 ? (
                      <>
                        <Check className="size-4" /> Confirmed
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
        </PhoneFrame>
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
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-20">
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
