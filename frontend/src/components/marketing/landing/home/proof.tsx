import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
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

const TIMES = ["14:45", "15:00", "15:15"];

function Screen({
  picked,
  gone,
  caption,
  done,
}: {
  picked: string;
  gone?: string;
  caption: string;
  done?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs">
      <div className="grid grid-cols-3 gap-2">
        {TIMES.map((t) => (
          <span
            key={t}
            className={cn(
              "tnum rounded-lg border border-border py-1.5 text-center text-sm font-medium",
              t === picked && "border-primary bg-primary text-primary-foreground",
              t === gone && "border-border-subtle text-subtle-foreground line-through",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm">
        {done && <Check aria-hidden className="size-4 shrink-0 text-success" />}
        {caption}
      </p>
    </div>
  );
}

/** What "no double bookings" looks like: two people, one time, and what each of them sees. */
function SameMoment() {
  return (
    <figure className="mt-12">
      <figcaption className="text-sm font-medium">Two people tap 15:00 at the same moment:</figcaption>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Screen picked="15:00" caption="One gets it. Booked for 15:00." done />
        <Screen picked="15:15" gone="15:00" caption="The other is told straight away, and offered 15:15." />
      </div>
    </figure>
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
        <SameMoment />
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
