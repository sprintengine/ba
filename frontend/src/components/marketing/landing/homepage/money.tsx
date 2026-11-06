import { ArrowRight, Banknote, CreditCard, HandCoins, Repeat } from "lucide-react";
import { PrismContainer, PrismHeading } from "../heading";
import { LogoMarquee } from "./logo-marquee";

const WAYS = [
  { icon: CreditCard, title: "Pay in full" },
  { icon: HandCoins, title: "Take a deposit" },
  { icon: Banknote, title: "Pay on the day" },
  { icon: Repeat, title: "Memberships and packs" },
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
      className="scroll-mt-24 pt-16 pb-16 sm:pt-20 sm:pb-20"
    >
      <PrismContainer>
        <PrismHeading
          id="payments-title"
          align="left"
          label="Payments"
          title="The money goes straight to you."
          lit="We take 0%"
          punch
          dot
          lead="Clients pay into your own account, through the payment provider you already use or one you pick."
        />
        <div className="mt-12 sm:mt-14">
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-start sm:gap-8 sm:p-10">
            <Stop
              label="Client pays"
              value="€60.00"
              note="A follow-up like the one above, by card, wallet or pay later."
            />
            <ArrowRight
              className="size-5 shrink-0 text-subtle-foreground max-sm:rotate-90 sm:mt-9"
              aria-hidden
            />
            <Stop
              label="We take"
              value="€0.00"
              note="No cut, on any plan. Your money never passes through us."
            />
            <ArrowRight
              className="size-5 shrink-0 text-subtle-foreground max-sm:rotate-90 sm:mt-9"
              aria-hidden
            />
            <Stop
              label="Your account"
              value="€60.00"
              note="Before your provider’s usual card fee, paid out on their usual days."
            />
          </div>
        </div>
      </PrismContainer>
      <LogoMarquee className="mt-12 sm:mt-14" />
      <PrismContainer>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {WAYS.map(({ icon: Icon, title }) => (
            <li
              key={title}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {title}
            </li>
          ))}
        </ul>
      </PrismContainer>
    </section>
  );
}
