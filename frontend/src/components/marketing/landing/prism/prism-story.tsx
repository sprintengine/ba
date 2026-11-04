"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import s from "./prism.module.css";
import { ClosingCta, HeroCopy } from "./story-parts";
import { usePrismStage, type StageRefs } from "./use-prism-stage";

/**
 * The landing's frame: one piece of glass in the hero, the page's sections scrolling over it as normal (starting with
 * the story beats, see story-beats.tsx), and the same slab again under the closing call to action.
 *
 * Fixed layers sit behind everything: the studio light, the WebGL canvas (loaded after first paint on capable devices)
 * and the HTML faces, which ride the live slab or, without it (reduced motion, no WebGL, Save-Data, low-end devices),
 * show as panes of CSS glass. Either way the hero face appears once, already in place: no still is shown first and
 * swapped out. `faces` is server-rendered and passed in, so its markup costs no client JavaScript.
 */
export function PrismStory({ faces, children }: { faces: React.ReactNode; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLElement>(null);
  const ctaAnchor = useRef<HTMLDivElement>(null);
  const refs = useMemo<StageRefs>(
    () => ({
      root,
      stage,
      hero,
      canvas,
      overlay,
      face,
      sheen,
      cta,
      ctaAnchor,
    }),
    [],
  );
  usePrismStage(refs);

  return (
    <div ref={root} className={cn(s.root, "-mt-20 max-[760px]:-mt-[4.5rem]")}>
      <div aria-hidden className={s.studio} />
      <canvas ref={canvas} aria-hidden className={s.canvas} />
      <div ref={overlay} aria-hidden className={s.overlay}>
        <div ref={face} className={s.face}>
          <div ref={sheen} className={s.sheen} />
          {faces}
        </div>
      </div>

      <section ref={stage} aria-label="bookanything" className={s.stage}>
        <HeroCopy ref={hero} />
      </section>

      <div className="relative z-[5] overflow-x-clip bg-background before:pointer-events-none before:absolute before:inset-x-0 before:-top-40 before:h-40 before:bg-linear-to-b before:from-transparent before:to-background">
        {children}
      </div>

      <ClosingCta ref={cta} anchor={ctaAnchor} />
    </div>
  );
}
