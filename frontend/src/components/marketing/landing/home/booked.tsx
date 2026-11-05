import { Banknote, CreditCard, HandCoins, Repeat } from "lucide-react";
import { PrismContainer, PrismHeading } from "../heading";
import { BookedScene } from "./booked-scene";

const WAYS = [
  { icon: CreditCard, title: "Pay in full", body: "Paid when they book, so no-shows don't cost you." },
  { icon: HandCoins, title: "Take a deposit", body: "Hold the time with part of the price." },
  { icon: Banknote, title: "Pay on the day", body: "Free to book, and paid when they arrive." },
  { icon: Repeat, title: "Memberships and packs", body: "Sell a block of sessions or a monthly plan." },
];

const PROVIDERS = ["Stripe", "PayPal", "Adyen", "Mollie", "Klarna", "Apple Pay", "Google Pay"];

/** What the product does, in one picture: the client's phone, then the business's calendar, then how it's paid. */
export function BookedSection() {
  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 pt-12 pb-24 sm:pb-32">
      <PrismContainer>
        <PrismHeading
          id="product-title"
          label="How it works"
          title="They book on their phone."
          lit="You see it on your calendar."
          lead="Clients pick a time that's actually free and pay online. No calls, no back and forth, and nothing to copy across."
        />
        <div className="mt-10 sm:mt-12">
          <BookedScene />
        </div>
        <p className="sr-only">
          A client picks a sports massage on their phone, chooses 15:30 on Thursday and pays €45. The booking
          appears straight away on the business&apos;s calendar, in Sam&apos;s column.
        </p>
        <div className="mt-16 grid gap-10 border-t border-border pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.03em]">Take payment your way.</h3>
            <p className="mt-3 text-base leading-[1.6] text-muted-foreground">
              Choose for each service. Card, Apple Pay and Google Pay go straight to your own Stripe account,
              and we take 0%.
            </p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {WAYS.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon className="size-5 text-muted-foreground" aria-hidden />
                <p className="mt-3 font-semibold tracking-tight">{title}</p>
                <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-[0.9375rem] font-semibold tracking-tight text-subtle-foreground">
          {PROVIDERS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </PrismContainer>
    </section>
  );
}
