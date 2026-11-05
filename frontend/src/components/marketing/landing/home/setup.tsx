import { Sparkles } from "lucide-react";
import { PrismContainer, PrismHeading } from "../heading";

const DRAFT: { label: string; value: string }[] = [
  { label: "Services", value: "Initial assessment, follow-up, sports massage" },
  { label: "Hours", value: "Mon to Sat, 09:00 to 18:00" },
  { label: "Team", value: "Sam, Aoife and Niamh" },
  { label: "Rooms", value: "Rooms 1 to 3, rehab gym" },
];

const ALSO = [
  ["One calendar", "Staff, rooms and equipment, all held by one booking."],
  ["Reminders", "Email and text, so fewer people forget."],
  ["Quiet-time offers", "Off-peak and last-minute prices that fill the gaps."],
  ["Customer groups", "Members and regulars get their own times and prices."],
];

/** Setting up: describe the business, get a draft; and what else comes with it. */
export function SetupSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24 py-20 sm:py-28">
      <PrismContainer>
        <PrismHeading
          id="features-title"
          align="left"
          label="Set up"
          title="Tell us what you do."
          lit="It's ready this afternoon."
          lead="Describe your business or paste your website. AI drafts your services, prices, hours and booking page. You check it, and nothing goes live until you say."
        />
        <div className="mt-12 grid items-center gap-8 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] font-medium tracking-[-0.025em] text-balance">
              “A physio clinic in Dublin. Three physios, three rooms and a rehab gym.”
            </p>
            <p className="mt-5 flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
              <Sparkles className="size-4" aria-hidden /> Drafted from that one sentence
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <dl className="flex flex-col">
              {DRAFT.map((d) => (
                <div
                  key={d.label}
                  className="border-b border-border-subtle py-3 first:pt-0 last:border-0 last:pb-0"
                >
                  <dt className="text-sm text-muted-foreground">{d.label}</dt>
                  <dd className="mt-0.5 font-medium">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ALSO.map(([title, body]) => (
            <li key={title}>
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </PrismContainer>
    </section>
  );
}
