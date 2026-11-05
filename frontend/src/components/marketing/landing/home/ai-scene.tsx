"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { IPhone } from "./iphone";
import { SampleBooking, SceneToggle, type SampleBookingProps } from "./scene-parts";
import { useScene } from "./use-scene";

/** The chats run the assistant's real card, so they come as their own chunk; the frames hold their place. */
const OwnerChat = dynamic(() => import("./ai-chat").then((m) => m.OwnerChat), {
  ssr: false,
  loading: () => <IPhone time="15:14" />,
});
const ClientChat = dynamic(() => import("./ai-chat").then((m) => m.ClientChat), {
  ssr: false,
  loading: () => <IPhone time="15:14" />,
});

/** A chat's steps: asked, then a proposal, then it's being approved, then done. */
const STEPS = [1300, 3400, 800, 5600] as const;
const LAST = STEPS.length - 1;

export type AiSide = "owner" | "customer";

const TABS: { key: AiSide; label: string }[] = [
  { key: "owner", label: "For your business" },
  { key: "customer", label: "For your customers" },
];

/** What each conversation leaves on the calendar, as the calendar draws it. */
const OUTCOME: Record<AiSide, SampleBookingProps> = {
  owner: {
    who: "Remy Stroud",
    when: "14:00–14:45",
    what: "Friday",
    color: "#0ea5e9",
    via: "Moved to Aoife · Client told",
  },
  customer: {
    who: "Rory Kane",
    when: "15:30–16:15",
    what: "Thursday",
    color: "#0ea5e9",
    via: "Their AI assistant · Paid €60",
  },
};

function Side({
  side,
  shown,
  paused,
  onLoop,
  children,
}: {
  side: AiSide;
  /** Below the wide layout one side shows at a time. */
  shown: boolean;
  paused: boolean;
  onLoop: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const step = useScene(ref, STEPS, paused);
  const previous = useRef(0);
  useEffect(() => {
    if (previous.current === LAST && step === 0) onLoop();
    previous.current = step;
  }, [step, onLoop]);
  const Chat = side === "owner" ? OwnerChat : ClientChat;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center gap-8 lg:flex-row lg:gap-16 xl:flex-1 xl:gap-8",
        side === "customer" && "xl:flex-row-reverse",
        !shown && "max-xl:hidden",
      )}
    >
      <div className="w-full min-w-0 flex-1">
        <h3 className="mb-5 text-[0.9375rem] font-semibold text-muted-foreground max-xl:hidden">
          {TABS.find((t) => t.key === side)?.label}
        </h3>
        {children}
        <div className="mt-6 h-[5.25rem]" aria-hidden>
          {step === LAST && <SampleBooking {...OUTCOME[side]} className="relative animate-rise" />}
        </div>
      </div>
      <div
        ref={ref}
        aria-hidden
        inert
        className="[--iphone-scale:0.76] lg:[--iphone-scale:0.74] xl:[--iphone-scale:0.76]"
      >
        <Chat step={step} />
      </div>
    </div>
  );
}

/**
 * The two sides of the AI story, side by side where there's room: the owner's assistant, and a client's. On a narrower
 * screen they take turns, until the visitor picks one.
 */
export function AiScene({
  heading,
  footer,
  children,
}: {
  heading: React.ReactNode;
  footer: React.ReactNode;
  children: Record<AiSide, React.ReactNode>;
}) {
  const [tab, setTab] = useState<AiSide>("owner");
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const turn = useCallback(() => {
    if (auto) setTab((t) => (t === "owner" ? "customer" : "owner"));
  }, [auto]);

  return (
    <div>
      {heading}
      <div
        role="group"
        aria-label="Who the assistant works for"
        className="mt-8 inline-flex gap-1 rounded-xl bg-muted p-1 xl:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => {
              setAuto(false);
              setTab(t.key);
            }}
            className={cn(
              "focus-ring rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors pointer-coarse:min-h-11",
              tab === t.key && "bg-surface text-foreground shadow-xs",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-6 xl:mt-14 xl:flex-row">
        {TABS.map((t) => (
          <Side key={t.key} side={t.key} shown={tab === t.key} paused={paused} onLoop={turn}>
            {children[t.key]}
          </Side>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {footer}
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          Example chats with a made-up clinic.
          {!reduce && <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />}
        </span>
      </div>
    </div>
  );
}
