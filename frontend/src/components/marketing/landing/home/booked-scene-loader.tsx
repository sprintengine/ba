"use client";

import dynamic from "next/dynamic";
import { IPhone } from "./iphone";
import { SCENE_CALENDAR, SCENE_GRID } from "./scene-parts";

/** What the scene takes up until its chunk arrives: the same frames, so nothing moves when it does. */
function Poster() {
  return (
    <div className={SCENE_GRID}>
      <IPhone />
      <div className={`${SCENE_CALENDAR} rounded-2xl bg-background ring-1 ring-border`} />
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
