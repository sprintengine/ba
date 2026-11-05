import { PrismContainer, PrismHeading } from "../heading";
import { SetupDraft } from "./setup-draft";

const ALSO = [
  ["One calendar", "Your staff, rooms and equipment, all in one place."],
  ["Reminders", "Email and text, so fewer people forget."],
  ["Quiet-time offers", "Lower prices at quiet times, to fill the gaps."],
  ["Members and regulars", "Give them their own times and prices."],
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
          lit="It’s ready this afternoon."
          punch
          lead="Describe your business in a sentence, or paste your website. We set out what you told us, suggest the rest, and nothing goes live until you’ve checked it."
        />
        <SetupDraft />
        <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
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
