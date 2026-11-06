import { PrismContainer, PrismHeading } from "../heading";

const BEATS = [
  {
    title: "Clients book and pay",
    body: "They pick a free time on your page and pay online. No phone calls.",
  },
  {
    title: "It lands on your calendar",
    body: "Paid, with the right person and room, and nothing for you to type in.",
  },
  {
    title: "Reminders go out",
    body: "Already set the moment it’s booked, so people turn up.",
  },
];

/** The hero's story in words: what just happened on the phone and the calendar, and what happens next. */
export function BookedSection() {
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="scroll-mt-24 pt-14 pb-24 sm:pt-20 sm:pb-32"
    >
      <PrismContainer className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <PrismHeading
          id="product-title"
          align="left"
          label="How it works"
          title="Your day, on one calendar."
          lit="Bookings arrive while you work."
        />
        <ol className="flex flex-col divide-y divide-border lg:pt-8">
          {BEATS.map((beat) => (
            <li key={beat.title} className="py-4 first:pt-0 last:pb-0">
              <h3 className="text-lg font-semibold tracking-tight">{beat.title}</h3>
              <p className="mt-1 text-base leading-[1.55] text-pretty text-muted-foreground">{beat.body}</p>
            </li>
          ))}
        </ol>
      </PrismContainer>
    </section>
  );
}
