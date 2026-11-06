"use client";

import { AiBadge } from "@/components/brand/logo";
import { DescribeForm } from "./describe-form";

const SENTENCE = "A physio clinic in Dublin. Three physios, three rooms and a rehab gym.";
/** What the sentence really says. */
const YOURS = [
  ["Business", "Physio clinic, Dublin"],
  ["Team", "Three physios"],
  ["Rooms", "Three rooms and a rehab gym"],
];
/** What it doesn't say: our suggestions, for the owner to change. */
const SUGGESTED = [
  ["Services", "Initial assessment, follow-up, sports massage"],
  ["Prices", "€70, €60 and €40"],
  ["Hours", "Mon to Sat, 09:00 to 18:00"],
];

function Rows({ rows }: { rows: string[][] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One sentence becoming a draft to check; and a box to try your own. */
export function SetupDraft() {
  return (
    <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">You write</p>
        <p className="mt-2 text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] font-medium tracking-[-0.025em]">
          “{SENTENCE}”
        </p>
        <DescribeForm cta="Set mine up" className="mt-8 lg:max-xl:flex-col lg:max-xl:[&>input]:flex-none" />
      </div>
      <section
        aria-label="Your draft"
        className="min-w-0 rounded-2xl border border-border bg-surface shadow-xs"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
          <h3 className="font-semibold tracking-tight whitespace-nowrap">Check your draft</h3>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
            Not live yet
          </span>
        </div>
        <div className="grid sm:grid-cols-2">
          <div className="flex flex-col gap-3 px-5 py-4">
            <p className="text-sm font-semibold">From what you wrote</p>
            <Rows rows={YOURS} />
          </div>
          <div className="flex flex-col gap-3 border-border-subtle px-5 py-4 max-sm:border-t sm:border-l">
            <AiBadge className="text-sm font-semibold text-foreground">Suggested, for you to change</AiBadge>
            <Rows rows={SUGGESTED} />
          </div>
        </div>
        <p className="border-t border-border-subtle px-5 py-3.5 text-sm text-muted-foreground">
          Change anything, add your team’s names, then go live when you’re happy.
        </p>
      </section>
    </div>
  );
}
