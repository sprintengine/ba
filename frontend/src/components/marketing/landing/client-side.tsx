import { BellRing, CalendarCheck2, CreditCard, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerDemo } from "../demo/customer/customer-demo";
import { PrismContainer, PrismHeading } from "./heading";
import s from "./prism/prism.module.css";

const POINTS = [
  {
    icon: CalendarCheck2,
    title: "Only free times",
    body: "They only see times when the therapist and the room are both free.",
  },
  {
    icon: CreditCard,
    title: "Paid when they book",
    body: "Card, Apple Pay or Google Pay, paid into your Stripe account.",
  },
  {
    icon: BellRing,
    title: "Reminders sent for you",
    body: "A confirmation, a calendar invite and reminders by email and text.",
  },
  {
    icon: RefreshCw,
    title: "Changes without a phone call",
    body: "They move or cancel their own booking, inside your notice period.",
  },
];

/** The same clinic from the client's side: the booking page, tapped through on a phone. */
export function ClientSideSection() {
  return (
    <section
      id="clients"
      aria-labelledby="clients-title"
      className="scroll-mt-24 overflow-hidden pt-28 sm:pt-36"
    >
      <PrismContainer className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="flex flex-col gap-10">
          <PrismHeading
            id="clients-title"
            align="left"
            label="For your clients"
            title="Booking takes your clients"
            lit="about a minute."
            lead="They open your link, pick a time, pay and get a confirmation by email. They don’t need to make an account."
          />
          <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-foreground shadow-(--prism-chip-shadow) ring-1 ring-border-subtle [&_svg]:size-[1.125rem]">
                  <p.icon />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[0.9375rem] font-semibold tracking-tight">{p.title}</span>
                  <span className="text-sm leading-normal text-muted-foreground">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[25rem] xl:max-w-[34rem]">
          <div aria-hidden className={cn(s.glow, "top-[42%] h-[55%] w-[170%] -rotate-12 xl:w-[125%]")} />
          <div className="relative">
            <CustomerDemo />
          </div>
        </div>
      </PrismContainer>
    </section>
  );
}
