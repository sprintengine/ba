"use client";

import dynamic from "next/dynamic";
import { AiBadge } from "@/components/brand/logo";
import { DescribeForm } from "./describe-form";
import { IPhone } from "./iphone";

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

/** The booking page the draft makes, as a phone shows it: the real page, in its own chunk. */
const DraftPage = dynamic(() => import("./scenes").then((m) => m.SetupPage), {
  ssr: false,
  loading: () => <IPhone time="15:08" />,
});

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

/** One sentence becoming a draft to check, and the booking page it makes; and a box to try your own. */
export function SetupDraft() {
  return (
    <div className="mt-12 grid gap-8 sm:mt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div className="flex flex-col justify-center">
        <p className="text-sm font-semibold text-muted-foreground">You write</p>
        <p className="mt-2 text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] font-medium tracking-[-0.025em]">
          “{SENTENCE}”
        </p>
        <DescribeForm cta="Set mine up" className="mt-8 lg:max-xl:flex-col lg:max-xl:[&>input]:flex-none" />
      </div>
      <div className="flex items-center gap-8 [--iphone-scale:0.46] max-sm:flex-col max-sm:items-stretch max-sm:gap-5">
        <section
          aria-label="Your draft"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-surface shadow-xs"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
            <h3 className="font-semibold tracking-tight">Check your draft</h3>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Not live yet
            </span>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <p className="text-sm font-semibold">From what you wrote</p>
            <Rows rows={YOURS} />
          </div>
          <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4">
            <AiBadge className="text-sm font-semibold text-foreground">Suggested, for you to change</AiBadge>
            <Rows rows={SUGGESTED} />
          </div>
          <p className="border-t border-border-subtle px-5 py-3.5 text-sm text-muted-foreground">
            Change anything, add your team’s names, then go live when you’re happy.
          </p>
        </section>
        <div
          aria-hidden
          inert
          className="shrink-0 max-sm:mx-auto max-sm:h-60 max-sm:overflow-hidden max-sm:[mask-image:linear-gradient(black_72%,transparent)]"
        >
          <DraftPage />
        </div>
      </div>
    </div>
  );
}
