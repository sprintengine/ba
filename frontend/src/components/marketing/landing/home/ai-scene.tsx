"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { PrismContainer } from "../heading";
import { BrowserWindow } from "./browser-window";
import {
  SCENE_CALENDAR,
  SCENE_CHAT,
  SCENE_GRID,
  SCENE_PANEL,
  SCENE_WINDOW,
  SceneToggle,
} from "./scene-parts";

export type AiSide = "owner" | "customer";

const TABS: { key: AiSide; label: string }[] = [
  { key: "owner", label: "For your business" },
  { key: "customer", label: "For your customers" },
];

/** What the stage takes up until its chunk arrives: the same frames, so nothing moves when it does. */
function Poster() {
  return (
    <div className={SCENE_GRID}>
      <div className={cn(SCENE_CHAT, "rounded-2xl bg-surface")} />
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
 * The AI story, one side at a time on one stage: the visitor picks whose story it is, and nothing changes under someone
 * who is reading. The stage is the page's second panel on a blurred photograph, the first being the hero's.
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
      <PrismContainer>
        {heading}
        <div className="mt-8 flex sm:justify-center lg:mt-10">
          <div
            role="group"
            aria-label="Who the assistant works for"
            className="flex gap-1 rounded-xl bg-muted p-1"
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
        </div>
      </PrismContainer>
      <div className={cn(SCENE_PANEL, "mt-6")}>
        <AiStage key={tab} side={tab} paused={paused} />
      </div>
      <PrismContainer>
        <div className="mt-8 lg:mt-10">{children[tab]}</div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          {footer}
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
            Example chats with a made-up clinic.
            {!reduce && <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />}
          </span>
        </div>
      </PrismContainer>
    </div>
  );
}
