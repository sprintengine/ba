import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismHeading } from "../heading";

/** What an owner needs to know about their bookings and their clients' details. Each is backed by the legal pages. */
const KEPT = [
  ["Your clients are yours", "You own your client list, and you can download any client’s record."],
  ["Kept in the EU", "Your bookings and client details are stored in the EU."],
  ["Backed up every night", "And we test the backups to make sure they work."],
  ["Private answers stay private", "Answers you mark as private are never sent to an AI."],
];

const TIMES = ["14:45", "15:00", "15:15"];

/** A page of times with one taken: what the next client sees, the moment a time is booked. */
function Taken() {
  return (
    <figure className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs">
      <div className="grid grid-cols-3 gap-2" aria-hidden>
        {TIMES.map((t) => (
          <span
            key={t}
            className={cn(
              "tnum rounded-lg border border-border py-1.5 text-center text-sm font-medium",
              t === "15:00" && "border-border-subtle text-subtle-foreground line-through",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <figcaption className="flex items-center gap-2 text-sm">
        <Check aria-hidden className="size-4 shrink-0 text-success" />
        15:00 is booked, so nobody else can take it.
      </figcaption>
    </figure>
  );
}

/** Why it's safe to rely on: what the owner gets, in plain words, with the promises that sit behind it. */
export function ProofSection() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="scroll-mt-24 bg-surface-sunken py-20 sm:py-28"
    >
      <PrismContainer>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <PrismHeading
            id="proof-title"
            align="left"
            label="Peace of mind"
            title="No double bookings."
            lit="Client details kept safe."
            punch
            lead="Your staff, rooms and equipment are only ever in one place at a time. Once a time is booked, it’s gone for everyone else, and nobody turns up to find their slot was taken."
          />
          <Taken />
        </div>
        <ul className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {KEPT.map(([title, body]) => (
            <li key={title}>
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/sign-up">
              Start for free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="#industries">See the examples</Link>
          </Button>
        </div>
      </PrismContainer>
    </section>
  );
}
