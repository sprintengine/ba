import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismHeading } from "../heading";

/** From the simulation run of 4 November 2026. Update it from a new report. */
const SIMULATED = "19,486";

/** What an owner needs to know about their bookings and their clients' details. Each is backed by the legal pages. */
const KEPT = [
  ["Your clients are yours", "You own your client list, and you can download any client’s record."],
  ["Kept in the EU", "Your bookings and client details are stored in the EU."],
  ["Backed up every night", "And we test the backups to make sure they work."],
  ["Private answers stay private", "Answers you mark as private are never sent to an AI."],
];

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum -ml-[0.05em] text-[clamp(2.5rem,4.6vw,3.75rem)] leading-none font-semibold tracking-[-0.04em]">
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Why it's safe to rely on: the working examples are the proof, with the plain promises that sit behind them. */
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
            lead="Once a time is booked, it’s gone for everyone else. Don’t take our word for it: try the examples above."
          />
          <div className="grid grid-cols-2 gap-6">
            <Figure value={SIMULATED} label="test bookings across simulated businesses" />
            <Figure value="0" label="double bookings" />
          </div>
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
