"use client";

import { assistantMarketed } from "@/lib/assistant/flag";
import { DemoOverlay, DemoSheet, DemoToast } from "./primitives";
import { BoPanel } from "./screens/bo-panel";
import { BookingDrawer } from "./screens/booking-drawer";
import { CalendarScreen } from "./screens/calendar";
import { OverviewScreen } from "./screens/overview";
import { ServiceSheet } from "./screens/service-sheet";
import { ServicesScreen } from "./screens/services";
import { TherapistsScreen } from "./screens/therapists";
import { EMPTY_DRAFT, type OwnerState } from "./state";
import { DemoShell } from "./shell";

function Screen({ s }: { s: OwnerState }) {
  switch (s.route) {
    case "overview":
      return <OverviewScreen />;
    case "services":
      return <ServicesScreen services={s.services} />;
    case "therapists":
      return <TherapistsScreen hours={s.hours} dirty={s.hoursDirty} />;
    case "calendar":
      return <CalendarScreen bookings={s.bookings} />;
  }
}

/** The replica dashboard in one state of the script (loaded on its own: see OwnerDemo). */
export function OwnerApp({ s }: { s: OwnerState }) {
  // Without Bo on the public pages, the replica has no launcher or panel either (the tour skips Bo's chapter).
  const bo = assistantMarketed();
  const overlay = !!s.sheet || !!s.drawer || (bo && s.bo.open);
  return (
    <DemoShell
      route={s.route}
      bo={bo}
      boOpen={s.bo.open}
      scroll={s.scroll}
      overlays={
        <>
          <DemoOverlay show={overlay} />
          <DemoSheet open={!!s.sheet} width={1000}>
            <ServiceSheet d={s.sheet ?? EMPTY_DRAFT} />
          </DemoSheet>
          <DemoSheet open={!!s.drawer} width={520} className="overflow-hidden">
            <BookingDrawer />
          </DemoSheet>
          {bo && (
            <DemoSheet open={s.bo.open} width={440}>
              <BoPanel bo={s.bo} />
            </DemoSheet>
          )}
          <DemoToast toast={s.toast} />
        </>
      }
    >
      <Screen s={s} />
    </DemoShell>
  );
}
