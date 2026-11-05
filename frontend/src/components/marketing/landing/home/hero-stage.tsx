"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { HeroRings } from "./hero-rings";
import { IPhone } from "./iphone";
import { useScene } from "./use-scene";

const OwnerChat = dynamic(() => import("./ai-chat").then((m) => m.OwnerChat), {
  ssr: false,
  loading: () => <IPhone time="15:14" />,
});

/** The chat's proposal, then its approval, then the result: the product in the middle of doing something. */
const STEPS = [3600, 800, 5200] as const;

/** The rings, very large, with the owner's assistant at work on a phone in front of them. */
export function HeroStage() {
  const phone = useRef<HTMLDivElement>(null);
  const step = useScene(phone, STEPS, false);
  return (
    <div className="relative mx-auto mt-12 flex h-[calc(878px*var(--iphone-scale))] w-full items-center justify-center [--iphone-scale:0.5] [--ring-w:clamp(34rem,54vw,54rem)] sm:mt-16 sm:[--iphone-scale:0.56] lg:absolute lg:top-[calc(50%+1.25rem-var(--ring-w)*0.3535)] lg:right-[max(-2vw,calc(50vw-46rem))] lg:mt-0 lg:h-[calc(var(--ring-w)*0.707)] lg:w-(--ring-w) lg:justify-start lg:[--iphone-scale:0.52] xl:[--iphone-scale:0.6] [@media(min-width:1024px)_and_(max-height:760px)]:[--iphone-scale:0.5]">
      <HeroRings
        phone={phone}
        className="absolute top-1/2 left-1/2 aspect-[877/620] w-[min(100vw,44rem)] max-lg:-translate-x-1/2 max-lg:-translate-y-1/2 lg:inset-0 lg:size-full"
      />
      <div
        ref={phone}
        aria-hidden
        inert
        className="relative z-10 lg:absolute lg:top-1/2 lg:left-[70%] lg:-translate-x-1/2 lg:-translate-y-1/2"
      >
        <OwnerChat step={step + 1} />
      </div>
    </div>
  );
}
