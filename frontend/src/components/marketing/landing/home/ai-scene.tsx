"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { BrowserWindow } from "./browser-window";
import { IPhone } from "./iphone";
import { SCENE_CALENDAR, SCENE_GRID, SCENE_WINDOW, SceneToggle } from "./scene-parts";

export type AiSide = "owner" | "customer";

const TABS: { key: AiSide; label: string }[] = [
  { key: "owner", label: "For your business" },
  { key: "customer", label: "For your customers" },
];

/** What the stage takes up until its chunk arrives: the same frames, so nothing moves when it does. */
function Poster() {
  return (
    <div className={SCENE_GRID}>
      <IPhone time="15:08" />
      <BrowserWindow className={SCENE_WINDOW}>
        <div className={SCENE_CALENDAR} />
      </BrowserWindow>
    </div>
  );
}

/** The chats and the calendar run the real pieces, so they come as their own chunk, not with the page. */
const AiStage = dynamic(() => import("./scenes").then((m) => m.AiStage), {
  ssr: false,
  loading: Poster,
});

/**
 * The two sides of the AI story, one after the other where there's room. On a narrower screen one shows at a time, and
 * the visitor picks: nothing changes under someone who is reading.
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
  const [paused, setPaused] = useState(false);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;

  return (
    <div>
      {heading}
      <div
        role="group"
        aria-label="Who the assistant works for"
        className="mt-8 inline-flex gap-1 rounded-xl bg-muted p-1 lg:hidden"
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
      <div className="mt-8 flex flex-col gap-20 lg:mt-14">
        {TABS.map((t) => (
          <div key={t.key} className={cn(tab !== t.key && "max-lg:hidden")}>
            {children[t.key]}
            <div className="mt-8 lg:mt-10">
              <AiStage side={t.key} paused={paused} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {footer}
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          Example chats with a made-up clinic.
          {!reduce && <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />}
        </span>
      </div>
    </div>
  );
}
