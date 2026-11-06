import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrismContainer, PrismHeading } from "../heading";

const TIMES = ["15:30", "15:45", "16:00"];

/** A client's times, the first one chosen. */
function Times() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {TIMES.map((t, i) => (
          <span
            key={t}
            className={cn(
              "tnum rounded-lg border py-1.5 text-center text-sm font-medium",
              i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <span className="rounded-lg bg-primary py-1.5 text-center text-sm font-semibold text-primary-foreground">
        Book and pay €60
      </span>
    </div>
  );
}

/** The booking as the calendar shows it. */
function Landed() {
  return (
    <div className="rounded-md bg-[color-mix(in_oklab,#0ea5e9_14%,var(--surface))] px-3 py-2.5 text-sm">
      <p className="font-semibold">Rory Kane</p>
      <p className="tnum text-muted-foreground">15:30–16:15 · Follow-up treatment</p>
      <p>Sam Rivers, Room 1</p>
    </div>
  );
}

/** The reminder on its way. */
function Reminder() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-sm shadow-xs ring-1 ring-border">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted">
        <Bell className="size-3.5" aria-hidden />
      </span>
      <span>
        <span className="block font-semibold">See you tomorrow at 15:30</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Check className="size-3.5" aria-hidden /> Sent to Rory
        </span>
      </span>
    </div>
  );
}

const BEATS = [
  {
    title: "Clients book and pay",
    body: "They pick a free time on your page and pay online. No phone calls.",
    Picture: Times,
  },
  {
    title: "It lands on your calendar",
    body: "Paid, with the right person and room, and nothing for you to type in.",
    Picture: Landed,
  },
  {
    title: "Reminders go out",
    body: "Already set the moment it’s booked, so people turn up.",
    Picture: Reminder,
  },
];

/** The hero's story in small pieces of the product: what just happened, and what happens next. */
export function BookedSection() {
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="scroll-mt-24 pt-14 pb-16 sm:pt-20 sm:pb-24"
    >
      <PrismContainer>
        <PrismHeading
          id="product-title"
          align="left"
          label="How it works"
          title="Your day, on one calendar."
          lit="Bookings arrive while you work."
        />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {BEATS.map(({ title, body, Picture }) => (
            <li key={title} className="flex flex-col gap-5 rounded-2xl bg-surface-sunken p-5">
              <div aria-hidden className="flex min-h-28 flex-col justify-center">
                <Picture />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-1 text-base leading-[1.5] text-pretty text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </PrismContainer>
    </section>
  );
}
