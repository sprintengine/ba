"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { BusinessContextProvider } from "@/lib/business/business-context";
import { FixedNowProvider } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { VocabularyProvider } from "@/lib/vocabulary";
import { BookingActionsContext } from "@/components/dashboard/booking/booking-actions-provider";
import { CalendarView } from "@/components/dashboard/calendar/calendar-view";
import { ShareOriginContext } from "@/components/dashboard/overview/share-card";
import { NoPrefetchProvider } from "@/components/ui/app-link";
import { Rail } from "../calendar-pane";
import { SAMPLE_BUSINESS, SAMPLE_OWNER } from "./fixture-api";

export type Screen = "calendar" | "overview" | "customers" | "reports";

/** The app's address for each screen, for the window's bar. */
export const PATHS: Record<Screen, string> = {
  overview: "bookanything.ie/dashboard/lumen-physio",
  calendar: "bookanything.ie/dashboard/lumen-physio/calendar",
  customers: "bookanything.ie/dashboard/lumen-physio/customers",
  reports: "bookanything.ie/dashboard/lumen-physio/reports",
};

/**
 * The first screen comes with the stage. The rest are one chunk, fetched once the booking has landed: a visitor who
 * moves on never downloads them, and one split costs far less than a split per screen.
 */
const loadLater = () => import("./later-screens");
const later = (name: "OverviewView" | "CustomersList" | "ReportsView") =>
  dynamic(() => loadLater().then((m) => m[name]), { ssr: false });

const VIEWS: Record<Screen, React.ComponentType> = {
  calendar: CalendarView,
  overview: later("OverviewView"),
  customers: later("CustomersList"),
  reports: later("ReportsView"),
};

const BookingPanel = dynamic(() => loadLater().then((m) => m.BookingPanel), { ssr: false });

/** Fetches the other screens and the booking's side sheet ahead of the clicks that open them. */
export const preloadLaterScreens = () => void loadLater();

/** One page of the app, laid out as the dashboard shell lays it, clear of the phone over the window's edge. */
function Page({ screen, shown }: { screen: Screen; shown: boolean }) {
  const View = VIEWS[screen];
  const fills = screen === "calendar";
  return (
    <div
      data-screen={screen}
      className={cn(
        "absolute inset-0 overflow-hidden bg-background transition-opacity duration-200",
        !shown && "invisible opacity-0",
      )}
    >
      <div style={{ height: fills ? "100%" : undefined, marginRight: "var(--tour-covered, 0px)" }}>
        <div className={fills ? "h-full" : "px-10 py-8"}>
          <View />
        </div>
      </div>
    </div>
  );
}

/**
 * The app itself on the sample business: its real views, each asking its real hooks, answered by `client`. Screens
 * stay mounted once built, so going back to one costs nothing.
 */
export function TourApp({
  client,
  now,
  screen,
  mounted,
  booking,
  alerts,
  onOpenBooking,
  onCloseBooking,
  children,
}: {
  client: QueryClient;
  now: Date;
  screen: Screen;
  /** The screens built so far. */
  mounted: ReadonlySet<Screen>;
  /** The booking open in the side sheet. */
  booking: string | null;
  alerts: number;
  onOpenBooking: (id: string) => void;
  onCloseBooking: () => void;
  /** What sits over the page: the new booking's notice. */
  children: React.ReactNode;
}) {
  const actions = useMemo(
    () => ({ openBooking: onOpenBooking, openNewBooking: () => undefined }),
    [onOpenBooking],
  );
  const context = useMemo(
    () => ({ business: SAMPLE_BUSINESS, role: "owner" as const, me: SAMPLE_OWNER }),
    [],
  );
  return (
    <QueryClientProvider client={client}>
      <NoPrefetchProvider value>
        <FixedNowProvider value={now}>
          <BusinessContextProvider value={context}>
            <VocabularyProvider vocabulary={SAMPLE_BUSINESS.vocabulary}>
              <BookingActionsContext.Provider value={actions}>
                <ShareOriginContext.Provider value="https://bookanything.ie">
                  <div className="flex h-full min-h-0 bg-background">
                    <Rail active={screen} alerts={alerts} />
                    <div className="relative min-w-0 flex-1">
                      {[...mounted].map((s) => (
                        <Page key={s} screen={s} shown={s === screen} />
                      ))}
                      {booking && <BookingPanel id={booking} onClose={onCloseBooking} />}
                      {children}
                    </div>
                  </div>
                </ShareOriginContext.Provider>
              </BookingActionsContext.Provider>
            </VocabularyProvider>
          </BusinessContextProvider>
        </FixedNowProvider>
      </NoPrefetchProvider>
    </QueryClientProvider>
  );
}
