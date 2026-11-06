import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrismContainer, PrismHeading } from "../heading";

/** What an owner needs to know about their bookings and their clients' details. Each is backed by the legal pages. */
const KEPT = [
  ["Your clients are yours", "You own the list, and can download any client’s record."],
  ["Kept in the EU", "Bookings and client details are stored in the EU."],
  ["Backed up every night", "And we test the backups to make sure they work."],
  ["Private answers", "Answers you mark as private are never sent to an AI."],
];

const TIMES = ["14:45", "15:00", "15:15"];

/** A page of times with one taken: what the next client sees, the moment a time is booked. */
function Taken() {
  return (
    <figure className="flex h-full flex-col justify-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs">
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

/** Why it's safe to rely on: the booking rule at work, then the promises behind it, with where to read them. */
export function ProofSection() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="scroll-mt-24 bg-surface-sunken py-16 sm:py-20"
    >
      <PrismContainer>
        <PrismHeading
          id="proof-title"
          align="left"
          label="Peace of mind"
          title="No double bookings."
          lit="Client details kept safe."
          punch
          lead="Your staff, rooms and equipment are only ever in one place at a time. Once a time is booked, it’s gone for everyone else."
        />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <li className="sm:col-span-2 lg:row-span-1">
            <Taken />
          </li>
          {KEPT.map(([title, body]) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <Link
          href="/legal/privacy"
          className="focus-ring mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold"
        >
          How we handle your data <ArrowRight className="size-4" aria-hidden />
        </Link>
      </PrismContainer>
    </section>
  );
}
