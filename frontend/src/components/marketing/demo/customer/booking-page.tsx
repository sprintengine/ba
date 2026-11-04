"use client";

import { ChevronLeft, ChevronUp, Mail, MapPin, Phone, Tag } from "lucide-react";
import { formatAddress, shortAddress } from "@/lib/booking/booking";
import { cn } from "@/lib/utils";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import { useDemoTarget } from "../engine/demo-context";
import { DealBadge } from "@/components/offers/deal-price";
import { LUMEN, LUMEN_OFFERS } from "./fixture";

/*
 * The public booking page (`/lumen-physio/book`) on a phone: PublicBookingShell's header and footer, the
 * flow's progress and step header, and the mobile summary bar. Markup and classes follow
 * components/shells/public-booking-shell.tsx and components/booking/{booking-flow,steps,booking-summary}.tsx,
 * with only the mobile (base) classes, since the phone is narrow but the page around it isn't.
 */

/** The shell header: business tile and name, "Sign in" for a signed-out visitor. */
export function ShellHeader({ action = "Sign in" }: { action?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
        <span className="flex min-w-0 items-center gap-3 rounded-md">
          <BusinessTile
            name={LUMEN.name}
            logoUrl={LUMEN.branding.logoUrl}
            color={LUMEN.branding.primaryColor}
            size="lg"
            className="size-9"
          />
          <span className="truncate text-base font-semibold tracking-tight">{LUMEN.name}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" tabIndex={-1}>
            {action}
          </Button>
        </div>
      </div>
    </header>
  );
}

/** The shell footer: address, phone and email. */
export function ShellFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground">
        <ul className="flex flex-col gap-1.5">
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />{" "}
            {formatAddress(LUMEN.address)}
          </li>
          <li className="flex items-center gap-2">
            <Phone className="size-4 text-subtle-foreground" />
            {LUMEN.contactPhone}
          </li>
          <li className="flex items-center gap-2">
            <Mail className="size-4 text-subtle-foreground" />
            {LUMEN.contactEmail}
          </li>
        </ul>
      </div>
    </footer>
  );
}

function BusinessIntro() {
  return (
    <div className="mb-8 flex flex-col gap-2">
      {/* An h1 on the real page; not a second h1 on the page hosting the demo. */}
      <h2 className="text-2xl font-semibold tracking-tight text-balance">{LUMEN.name}</h2>
      <p className="max-w-2xl text-pretty text-muted-foreground">{LUMEN.description}</p>
      <p className="flex items-center gap-1.5 text-sm text-subtle-foreground">
        <MapPin className="size-3.5" aria-hidden /> {shortAddress(LUMEN.address)}
      </p>
      <PortalDeal />
    </div>
  );
}

/** The clinic's current deal above the flow, as components/offers/portal-deals.tsx draws it at phone width. */
function PortalDeal() {
  const [deal] = LUMEN_OFFERS;
  if (!deal) return null;
  return (
    <section aria-label="Current deal" className="mt-4 flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Tag className="size-4 text-brand" aria-hidden /> Current deal
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-balance">{deal.name}</p>
          <DealBadge label={deal.label} className="shrink-0" />
        </div>
        {deal.description && <p className="text-sm text-pretty text-muted-foreground">{deal.description}</p>}
        <p className="text-sm text-muted-foreground">{deal.summary}</p>
      </div>
    </section>
  );
}

function StepProgress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300",
            i <= index ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function StepHeader({
  index,
  total,
  title,
  description,
}: {
  index: number;
  total: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center gap-2 text-xs font-medium text-subtle-foreground">
        {index > 0 && (
          <>
            <span className="-ml-1.5 inline-flex h-7 items-center gap-0.5 rounded-md pr-2 pl-1 text-sm font-normal text-muted-foreground">
              <ChevronLeft className="size-4" /> Back
            </span>
            <span aria-hidden className="h-3.5 w-px bg-border" />
          </>
        )}
        <span className="tnum">
          Step {index + 1} of {total}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** The booking page around one step of the flow. */
export function BookingPage({
  index,
  total = 5,
  title,
  description,
  children,
}: {
  index: number;
  total?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <ShellHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-8">
        {index === 0 && <BusinessIntro />}
        <div className="flex min-w-0 flex-col gap-6 pb-32">
          <StepProgress index={index} total={total} />
          <StepHeader index={index} total={total} title={title} description={description} />
          <div key={title} className="animate-rise">
            {children}
          </div>
        </div>
      </div>
      <ShellFooter />
    </div>
  );
}

/**
 * The mobile summary bar (fixed to the bottom of the real page): the service with when and the total, and the
 * step's action; the last step shows only the action, full width.
 */
export function SummaryBar({
  when,
  action,
  actionOnly = false,
}: {
  when: string | null;
  action?: React.ReactNode;
  actionOnly?: boolean;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {actionOnly ? (
          <div className="flex flex-1 flex-col [&>button]:w-full">{action}</div>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">Initial assessment</span>
                <span className="tnum truncate text-xs text-muted-foreground">
                  {[when, "€70"].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronUp className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
            </span>
            {action}
          </>
        )}
      </div>
    </div>
  );
}

/** A primary call to action in the bar, pressed when the cursor taps it. */
export function BarAction({ id, children }: { id: string; children: React.ReactNode }) {
  const t = useDemoTarget(id);
  return (
    <Button
      {...t.props}
      variant="primary"
      size="lg"
      tabIndex={-1}
      className={cn(t.pressed && "scale-[0.98]")}
    >
      {children}
    </Button>
  );
}
