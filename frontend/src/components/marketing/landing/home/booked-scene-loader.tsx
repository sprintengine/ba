"use client";

import dynamic from "next/dynamic";
import { IPhone } from "./iphone";

/** What the scene takes up until its chunk arrives: the same frames, so nothing moves when it does. */
function Poster() {
  return (
    <div className="grid justify-items-center gap-5 [--iphone-scale:0.66] sm:[--iphone-scale:0.72] lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:justify-items-stretch lg:gap-12 lg:[--iphone-scale:0.82]">
      <IPhone />
      <div className="h-[13rem] w-full rounded-2xl bg-background ring-1 ring-border sm:h-[45rem]" />
    </div>
  );
}

/**
 * The scene runs the real booking and calendar components, so it comes as its own chunk, not with the page: on the
 * client only, because its date is today's.
 */
export const BookedSceneLoader = dynamic(() => import("./booked-scene").then((m) => m.BookedScene), {
  ssr: false,
  loading: Poster,
});
