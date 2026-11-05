"use client";

import { lazy, Suspense } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { BrowserWindow } from "./browser-window";
import { IPhone } from "./iphone";
import { BOOKED_BELOW, BOOKED_CALENDAR, BOOKED_GRID } from "./scene-parts";

/** The scene runs the real booking and calendar components, so it comes as its own chunk, not with the page. */
const BookedScene = lazy(() => import("./booked-scene").then((m) => ({ default: m.BookedScene })));

/** What the scene takes up until its chunk arrives: the same frames, with the words already there. */
function Poster({ children }: { children: React.ReactNode }) {
  return (
    <div className={BOOKED_GRID}>
      <BrowserWindow>
        <div className={BOOKED_CALENDAR} />
      </BrowserWindow>
      <div className={BOOKED_BELOW}>
        <div>{children}</div>
        <IPhone className="max-lg:hidden" />
      </div>
    </div>
  );
}

/** On the client only, because its date is today's. The words are in the page's HTML either way. */
export function BookedSceneLoader({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const poster = <Poster>{children}</Poster>;
  if (!mounted) return poster;
  return (
    <Suspense fallback={poster}>
      <BookedScene>{children}</BookedScene>
    </Suspense>
  );
}
