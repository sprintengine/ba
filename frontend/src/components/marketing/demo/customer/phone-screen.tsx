"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowRight, ChevronLeft, Ellipsis, Lock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { SiteScope } from "@/components/site/site-scope";
import { Spinner } from "@/components/ui/spinner";
import { ease } from "../../landing/prism/choreography";
import { BarAction, BookingPage, SummaryBar } from "./booking-page";
import { CheckoutScreen } from "./checkout-screen";
import { ServiceStep, TherapistStep } from "./choose-steps";
import { ConfirmedScreen } from "./confirmed-screen";
import { DetailsStep } from "./details-step";
import { LUMEN, LUMEN_STYLE } from "./fixture";
import { MyBookingsScreen } from "./my-bookings-screen";
import { PRICE, ReviewStep } from "./review-step";
import { TimeStep } from "./time-step";
import { demoDates, urlFor, type CustomerState } from "./state";

const SCROLL_MS = 650;

/**
 * The page's own scroll position, driven by the script: eased like a flick, and instant on a new page. A real
 * scroll container (not a transform) so the pages' sticky headers and bars behave as they do on a phone.
 */
function Scroller({ y, children }: { y: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      el.scrollTop = y;
      return;
    }
    const from = el.scrollTop;
    const begin = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - begin) / SCROLL_MS);
      el.scrollTop = from + (y - from) * ease(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [y]);
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {children}
    </div>
  );
}

/** Safari's compact bottom bar: back, the address, more. */
function SafariBar({ url }: { url: string }) {
  const pill =
    "flex h-9 items-center justify-center rounded-full bg-surface/85 shadow-sm ring-1 ring-border/70";
  return (
    <div className="relative z-30 flex h-[62px] shrink-0 gap-2 bg-background px-3 pt-1 text-foreground">
      <span className={cn(pill, "w-9 text-muted-foreground")}>
        <ChevronLeft className="size-4.5" />
      </span>
      <span className={cn(pill, "min-w-0 flex-1 gap-1.5 px-4 text-[0.8125rem] font-medium")}>
        <Lock className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{url}</span>
      </span>
      <span className={cn(pill, "w-9 text-muted-foreground")}>
        <Ellipsis className="size-4.5" />
      </span>
    </div>
  );
}

function RedirectOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm">
      <Spinner className="size-6" label="Redirecting" />
      <div className="text-center">
        <p className="font-medium">Taking you to secure payment…</p>
        <p className="mt-1 text-sm text-muted-foreground">Your time is held while you pay.</p>
      </div>
    </div>
  );
}

/** The booking flow's steps: the page, and what floats over it (summary bar, redirect overlay). */
function bookingView(s: CustomerState): { page: React.ReactNode; overlay?: React.ReactNode } {
  const date = s.date ?? demoDates(s.today).firstOpen;
  const when =
    s.date && s.time ? `${formatDate(s.date, LUMEN.timezone, "dayMonth", LUMEN.locale)}, ${s.time}` : null;
  switch (s.screen) {
    case "service":
      return {
        page: (
          <BookingPage index={0} total={4} title="Choose a service">
            <ServiceStep />
          </BookingPage>
        ),
      };
    case "therapist":
      return {
        page: (
          <BookingPage
            index={1}
            title="Choose your therapist"
            description="Or choose “Any” to see every available time."
          >
            <TherapistStep chosen={null} />
          </BookingPage>
        ),
        overlay: <SummaryBar when={null} />,
      };
    case "time":
      return {
        page: (
          <BookingPage index={2} title="Pick a time" description="Initial assessment · 1 h">
            <TimeStep today={s.today} nextWeek={s.nextWeek} date={date} time={s.time} />
          </BookingPage>
        ),
        overlay: <SummaryBar when={when} />,
      };
    case "details":
      return {
        page: (
          <BookingPage index={3} title="Your details" description={`So ${LUMEN.name} knows who's coming.`}>
            <DetailsStep details={s.details} selectOpen={s.selectOpen} />
          </BookingPage>
        ),
        overlay: (
          <SummaryBar
            when={when}
            action={
              <BarAction id="review">
                Review <ArrowRight />
              </BarAction>
            }
          />
        ),
      };
    default:
      return {
        page: (
          <BookingPage index={4} title="Review and confirm">
            <ReviewStep date={date} time={s.time ?? ""} details={s.details} />
          </BookingPage>
        ),
        overlay: (
          <>
            <SummaryBar
              when={when}
              actionOnly
              action={
                <BarAction id="continue-to-payment">
                  <Lock /> Continue to payment · {PRICE}
                </BarAction>
              }
            />
            {s.redirecting && <RedirectOverlay />}
          </>
        ),
      };
  }
}

/** The booking pages set in the landing's own typeface (Figtree) rather than the theme's, so they read as Prism. */
const PRISM_TYPE = {
  "--font-heading": "var(--font-sans)",
  "--font-body": "var(--font-sans)",
} as React.CSSProperties;

/** One page of the phone: inside its theme, a status bar pad, the scrolling page, its overlays and Safari. */
function Page({
  s,
  scope,
  page,
  overlay,
}: {
  s: CustomerState;
  scope: "site" | "business" | "platform";
  page: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="h-12 shrink-0 bg-background" />
      <div className="relative min-h-0 flex-1">
        <Scroller key={s.screen} y={s.scrollY}>
          {page}
        </Scroller>
        {overlay}
      </div>
      <SafariBar url={urlFor(s)} />
    </>
  );
  const className = "absolute inset-0 flex flex-col bg-background text-foreground";
  if (scope === "site")
    return (
      <SiteScope
        theme={LUMEN_STYLE.theme}
        palette={LUMEN_STYLE.palette}
        style={PRISM_TYPE}
        className={className}
      >
        {body}
      </SiteScope>
    );
  if (scope === "business")
    return (
      <BusinessThemeProvider primaryColor={LUMEN.branding.primaryColor} className={className}>
        {body}
      </BusinessThemeProvider>
    );
  return <div className={className}>{body}</div>;
}

export function PhoneScreen({ s }: { s: CustomerState }) {
  const date = s.date ?? demoDates(s.today).booked;
  const time = s.time ?? "12:30";
  switch (s.screen) {
    case "checkout":
      return (
        <Page
          s={s}
          scope="business"
          page={
            <CheckoutScreen
              date={date}
              time={time}
              email={s.details.email}
              cardFilled={s.cardFilled}
              paying={s.paying}
            />
          }
        />
      );
    case "confirmed":
      return (
        <Page
          s={s}
          scope="business"
          page={
            <ConfirmedScreen date={date} time={time} email={s.details.email} calendarMenu={s.calendarMenu} />
          }
        />
      );
    case "my-bookings":
      return <Page s={s} scope="platform" page={<MyBookingsScreen today={s.today} past={s.pastTab} />} />;
    default: {
      const view = bookingView(s);
      return <Page s={s} scope="site" page={view.page} overlay={view.overlay} />;
    }
  }
}
