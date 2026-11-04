"use client";

import { useMemo, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { todayInTz, type PlainDate } from "@/lib/format";
import { DemoStage } from "../engine/demo-stage";
import { customerChapters } from "./chapters";
import { demoToday, LUMEN_TIMEZONE } from "./state";

/**
 * The replica only renders once the stage nears the viewport (DemoStage), so it loads as its own chunk then, keeping the site
 * renderer, the booking screens and their dependencies out of the landing page's first load.
 */
const PhoneScreen = dynamic(() => import("./phone-screen").then((m) => m.PhoneScreen), { ssr: false });

/** The server (and the first client render) shows the week the fixture was captured; the client then moves on. */
const SERVER_TODAY: PlainDate = "2026-10-01";
const noSubscription = () => () => undefined;

/** The demo's "today": the next Thursday in the clinic's timezone, so every date on the phone is current. */
function useDemoToday(): PlainDate {
  return useSyncExternalStore(
    noSubscription,
    () => demoToday(todayInTz(LUMEN_TIMEZONE)),
    () => SERVER_TODAY,
  );
}

/**
 * The customer's side of the landing page: Lumen Physiotherapy's booking page on a phone, tapped through from the
 * booking link to the confirmation and My bookings. Replica booking pages.
 */
export function CustomerDemo() {
  const today = useDemoToday();
  const chapters = useMemo(() => customerChapters(today), [today]);
  return (
    <DemoStage
      chapters={chapters}
      width={390}
      height={844}
      frame="phone"
      start={{ x: 300, y: 640 }}
      label="A demo of booking a physiotherapy appointment on a phone, from the clinic's booking link to the confirmation"
      render={(s) => <PhoneScreen s={s} />}
    />
  );
}
