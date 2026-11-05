import { ArrowRight, Banknote, CreditCard, HandCoins, Repeat } from "lucide-react";
import { PrismContainer, PrismHeading } from "../heading";
import { LogoMarquee } from "./logo-marquee";

const WAYS = [
  { icon: CreditCard, title: "Pay in full", body: "Paid when they book, so no-shows don't cost you." },
  { icon: HandCoins, title: "Take a deposit", body: "Hold the time with part of the price." },
  { icon: Banknote, title: "Pay on the day", body: "Free to book, and paid when they arrive." },
  { icon: Repeat, title: "Memberships and packs", body: "Sell a block of sessions or a monthly plan." },
];

function Stop({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 sm:block">
      <p className="text-sm font-medium text-foreground sm:font-normal sm:text-muted-foreground">{label}</p>
      <p className="tnum text-right text-2xl leading-none font-semibold tracking-[-0.04em] sm:mt-1 sm:text-left sm:text-[clamp(1.75rem,3vw,2.5rem)]">
        {value}
      </p>
      <p className="col-span-2 mt-1 text-sm leading-normal text-muted-foreground sm:mt-2">{note}</p>
    </div>
  );
}

/** Where the money goes: from the client to the business's own account, with nothing taken on the way. */
export function MoneySection() {
  return (
    <section
      id="payments"
      aria-labelledby="payments-title"
      className="scroll-mt-24 pt-24 pb-16 sm:pt-32 sm:pb-20"
    >
      <PrismContainer>
        <PrismHeading
          id="payments-title"
          label="Payments"
          title="The money goes straight to you."
          lit="We take 0%."
          lead="Connect the payment provider you already use, or pick one. Clients pay it directly, into your own account."
        />
        <div className="mt-12 sm:mt-14">
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-start sm:gap-8 sm:p-10">
            <Stop label="Client pays" value="€45.00" note="By card, wallet or pay later, when they book." />
            <ArrowRight
              className="size-5 shrink-0 text-subtle-foreground max-sm:rotate-90 sm:mt-9"
              aria-hidden
            />
            <Stop label="We take" value="€0.00" note="No cut, on any plan. Your money never touches us." />
            <ArrowRight
              className="size-5 shrink-0 text-subtle-foreground max-sm:rotate-90 sm:mt-9"
              aria-hidden
            />
            <Stop
              label="Your account"
              value="€45.00"
              note="Less your provider's own card fee, on their payout days."
            />
          </div>
        </div>
      </PrismContainer>
      <LogoMarquee className="mt-12 sm:mt-14" />
      <PrismContainer>
        <ul className="mt-12 grid gap-8 border-t border-border pt-10 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
          {WAYS.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-semibold tracking-tight">{title}</p>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </PrismContainer>
    </section>
  );
}
