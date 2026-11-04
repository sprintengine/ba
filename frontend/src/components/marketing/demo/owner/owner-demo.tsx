"use client";

import dynamic from "next/dynamic";
import { DemoStage } from "../engine/demo-stage";
import { ownerChapters } from "./script";

/**
 * The replica only renders once the stage nears the viewport (DemoStage), so it loads as its own chunk then, keeping the dashboard
 * screens, the service form's rules and their dependencies out of the landing page's first load.
 */
const OwnerApp = dynamic(() => import("./owner-app").then((m) => m.OwnerApp), { ssr: false });

/** The landing hero: the physio's dashboard, driven by a cursor through setup, hours, bookings and, if offered, Bo. */
export function OwnerDemo({ className }: { className?: string }) {
  return (
    <DemoStage
      chapters={ownerChapters()}
      width={1280}
      height={780}
      start={{ x: 640, y: 420 }}
      label="A demo of the bookanything dashboard for a physiotherapy clinic"
      render={(s) => <OwnerApp s={s} />}
      className={className}
    />
  );
}
