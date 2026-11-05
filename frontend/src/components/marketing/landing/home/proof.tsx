import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismHeading } from "../heading";

/** From the simulation run of 4 November 2026: 19,486 bookings, none overlapping. Update it from a new report. */
const TESTED = "We put 19,486 test bookings through it, with bots, not customers, and not one clashed.";

/** What an owner needs to know about their bookings and their clients' details. Each is backed by the legal pages. */
const KEPT = [
  ["Your clients are yours", "You own your client list, and you can download any client's record."],
  ["Kept in the EU", "Your bookings and client details are stored in the EU."],
  ["Backed up every night", "And we test the backups to make sure they work."],
  ["Private answers stay private", "Answers you mark as private are never sent to an AI."],
];

/** Why it's safe to rely on: no double bookings, and the business's details looked after. */
export function ProofSection() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="scroll-mt-24 bg-surface-sunken py-20 sm:py-28"
    >
      <PrismContainer>
        <PrismHeading
          id="proof-title"
          align="left"
          label="Peace of mind"
          title="No double bookings."
          lit="Your clients' details kept safe."
          lead={TESTED}
        />
        <ul className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {KEPT.map(([title, body]) => (
            <li key={title}>
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <Button asChild variant="primary" size="xl" className="mt-12 rounded-[14px] font-semibold">
          <Link href="/sign-up">
            Start for free <ArrowRight />
          </Link>
        </Button>
      </PrismContainer>
    </section>
  );
}
