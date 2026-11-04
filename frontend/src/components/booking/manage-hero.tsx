"use client";

import Link from "next/link";
import { CalendarX2, Check, Clock, CreditCard, Hourglass, Undo2 } from "lucide-react";
import type { ManagedBooking } from "@/lib/api/types";
import { amountDueCents } from "@/lib/booking/booking";
import { formatCountdown } from "@/lib/booking/copy";
import { manageHeroText, type ManageHero } from "@/lib/booking/manage";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ShownHero = Exclude<ManageHero, { kind: "none" }>;

const ICONS: Record<ShownHero["kind"], React.ReactNode> = {
  confirmed: <Check strokeWidth={2.5} />,
  pending_approval: <Hourglass />,
  confirming_payment: <Clock />,
  awaiting_payment: <CreditCard />,
  cancelled: <CalendarX2 />,
  expired: <Clock />,
  past: <Check />,
};

const TONES: Record<ShownHero["tone"], string> = {
  success: "bg-success-soft text-success-soft-foreground border-success-border",
  info: "bg-info-soft text-info-soft-foreground border-info-border",
  warning: "bg-warning-soft text-warning-soft-foreground border-warning-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

/** The manage page's headline: what happened (or what to do next), with the matching action. */
export function ManageHeroBanner({
  hero,
  booking,
  knowsBusiness,
  remaining,
  noun,
  onPay,
  paying,
}: {
  hero: ManageHero;
  booking: ManagedBooking;
  /** The business's public profile has loaded. */
  knowsBusiness: boolean;
  remaining: number | null;
  noun: string;
  onPay: () => void;
  paying: boolean;
}) {
  if (hero.kind === "none") return null;
  const body =
    hero.kind === "awaiting_payment" ? (
      <AwaitingPaymentText remaining={remaining} noun={noun} />
    ) : (
      manageHeroText(hero.kind, booking, { noun, knowsBusiness })
    );
  const celebrate = hero.kind === "confirmed";
  return (
    <div className={cn("flex animate-rise items-start gap-4", celebrate && "py-2")}>
      <span
        className={cn(
          "relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border sm:size-12 sm:rounded-2xl [&_svg]:size-5",
          TONES[hero.tone],
          celebrate && "animate-pop-in",
        )}
        aria-hidden
      >
        {celebrate && (
          <span className="absolute inset-0 animate-ping rounded-2xl bg-success/20 [animation-iteration-count:2]" />
        )}
        {ICONS[hero.kind]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{hero.title}</h1>
        {body && <p className="text-pretty [overflow-wrap:anywhere] text-muted-foreground">{body}</p>}
        <HeroAction kind={hero.kind} booking={booking} onPay={onPay} paying={paying} />
      </div>
    </div>
  );
}

function AwaitingPaymentText({ remaining, noun }: { remaining: number | null; noun: string }) {
  if (remaining === null || remaining <= 0) return `Complete payment to confirm your ${noun}.`;
  return (
    <>
      Your time is held for{" "}
      <span className="tnum font-semibold" aria-live="off">
        {formatCountdown(remaining)}
      </span>
      . Complete payment to confirm your {noun}.
    </>
  );
}

function HeroAction({
  kind,
  booking: b,
  onPay,
  paying,
}: {
  kind: ShownHero["kind"];
  booking: ManagedBooking;
  onPay: () => void;
  paying: boolean;
}) {
  let action: React.ReactNode;
  switch (kind) {
    case "awaiting_payment":
      action = (
        <Button variant="primary" onClick={onPay} loading={paying}>
          <CreditCard /> Pay {formatMoney(amountDueCents(b), b.currency)}
        </Button>
      );
      break;
    case "cancelled":
      action = (
        <Button asChild variant="secondary">
          <Link href={`/${b.business.slug}`}>
            <Undo2 /> Book another time
          </Link>
        </Button>
      );
      break;
    case "expired":
    case "past":
      action = (
        <Button asChild variant={kind === "expired" ? "primary" : "secondary"}>
          <Link href={`/${b.business.slug}`}>Book again</Link>
        </Button>
      );
      break;
    case "confirmed":
    case "pending_approval":
    case "confirming_payment":
      return null;
  }
  return <div className="mt-3 flex flex-wrap gap-2">{action}</div>;
}
