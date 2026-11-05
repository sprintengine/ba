import { Check, CornerDownRight } from "lucide-react";
import { PrismContainer, PrismHeading } from "../heading";

/** Results of the simulation run of 4 November 2026, from its report. Update them together, from a new report. */
const RUN = [
  { value: "8 hours", label: "non-stop against the real system" },
  { value: "19,486", label: "bookings by scripted clients and owners" },
  { value: "1,615", label: "races for the same time" },
  { value: "0", label: "double bookings" },
];

const SHIPPED = [
  { date: "5 Nov", title: "The calendar drawn to scale, with soft booking cards" },
  { date: "4 Nov", title: "A reliability simulation that checks every rule" },
  { date: "3 Nov", title: "Nightly backups, each one restored and checked" },
  { date: "3 Nov", title: "Connect a payment account you already have" },
];

/** One time's two clients: the diagram of what the database rule does. */
function Race() {
  const lane = "flex items-center gap-3 rounded-xl bg-surface px-4 py-3.5 ring-1 ring-border";
  return (
    <div
      className="grid gap-3 font-medium sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
      aria-hidden
    >
      <div className="flex flex-col gap-3">
        <p className={lane}>
          <span className="size-2 rounded-full bg-[#7dd3fc]" /> Rory taps 15:30
        </p>
        <p className={lane}>
          <span className="size-2 rounded-full bg-[#fdba74]" /> Priya taps 15:30
        </p>
      </div>
      <div className="grid place-items-center rounded-xl border border-dashed border-border-strong px-4 py-3.5 text-center text-sm text-muted-foreground sm:h-full">
        <span>
          One rule,
          <br className="max-sm:hidden" /> in the database
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <p className={lane}>
          <Check className="size-4 text-[#86efac]" /> Booked with Sam at 15:30
        </p>
        <p className={lane}>
          <CornerDownRight className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Just taken. Next free time is 16:15</span>
        </p>
      </div>
    </div>
  );
}

/** Proof that needs no customers: how a double booking is stopped, and what a day of testing it found. */
export function ProofSection() {
  return (
    <section
      id="proof"
      data-mode="dark"
      aria-labelledby="proof-title"
      className="scroll-mt-24 bg-background py-20 text-foreground sm:py-28"
    >
      <PrismContainer>
        <PrismHeading
          id="proof-title"
          align="left"
          label="Built to hold"
          title="Two people tap 15:30."
          lit="One gets it."
          lead="A booking takes its person, room and equipment in one step, under a rule in the database itself. It can't be got around by a busy moment, a slow phone or an AI assistant, so a double booking can't be saved."
        />
        <div className="mt-10 sm:mt-12">
          <Race />
        </div>
        <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-border pt-10 lg:grid-cols-4">
          {RUN.map((r) => (
            <div key={r.label}>
              <dd className="tnum text-[clamp(2.25rem,4.4vw,3.75rem)] leading-none font-semibold tracking-[-0.045em]">
                {r.value}
              </dd>
              <dt className="mt-3 text-sm leading-normal text-muted-foreground">{r.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">
          From our simulation on 4 November: bots, not customers. It runs against the same system you would
          use, and every rule it checks stayed unbroken.
        </p>
        <div className="mt-14 border-t border-border pt-8">
          <h3 className="text-sm font-semibold text-muted-foreground">Recently shipped</h3>
          <ol className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {SHIPPED.map((s) => (
              <li key={s.title} className="text-[0.9375rem] leading-snug">
                <time className="tnum block text-sm text-muted-foreground">{s.date}</time>
                <span className="mt-0.5 block">{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </PrismContainer>
    </section>
  );
}
