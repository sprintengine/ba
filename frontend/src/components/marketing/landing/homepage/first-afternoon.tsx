import { Bell, Check, Link2, Tag, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrismContainer, PrismHeading } from "../heading";
import { SetupDraft, SetupSentence } from "./setup-draft";

const TIMES = ["15:30", "15:45", "16:00"];

/** The address, ready to paste. */
function Share() {
  return (
    <p className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-3 text-sm shadow-xs ring-1 ring-border">
      <Link2 className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
      <span className="truncate font-medium">bookanything.ie/lumen-physio</span>
    </p>
  );
}

/** A client's times, the first one chosen. */
function Times() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-xs ring-1 ring-border">
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
    <div className="rounded-xl bg-[color-mix(in_oklab,#0ea5e9_14%,var(--surface))] px-3 py-2.5 text-sm">
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

/** A quiet hour at its offer price, and a regular's own terms. */
function Quiet() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 shadow-xs ring-1 ring-border">
        <Tag className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
        <span className="tnum font-medium">Tuesday, 14:00</span>
        <span className="tnum ml-auto text-muted-foreground line-through">€60</span>
        <span className="tnum font-semibold">€48</span>
      </p>
      <p className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 shadow-xs ring-1 ring-border">
        <Users className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
        <span className="font-medium">Members</span>
        <span className="ml-auto text-muted-foreground">Their own times and prices</span>
      </p>
    </div>
  );
}

const STOPS: { at: string; title: string; body: string; pictures: React.ComponentType[] }[] = [
  {
    at: "14:20",
    title: "Share your link",
    body: "Put it on your website, Instagram or Google profile. Clients need no account.",
    pictures: [Share],
  },
  {
    at: "15:08",
    title: "A client books and pays",
    body: "They pick a free time and pay online. It lands on your calendar, with the right person and room, and nothing for you to type.",
    pictures: [Times, Landed],
  },
  {
    at: "After that",
    title: "It keeps itself full",
    body: "Reminders go out by email and text, so people turn up. Quiet hours fill at lower prices, and regulars get their own times.",
    pictures: [Reminder, Quiet],
  },
];

/** One point on the hour rail: the time, then what happens at it. */
function Stop({ at, className, children }: { at: string; className?: string; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        "grid gap-x-6 gap-y-1 pb-10 last:pb-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:pb-12",
        className,
      )}
    >
      <p className="tnum text-sm font-semibold text-muted-foreground sm:pt-0.5 sm:text-right">{at}</p>
      <div className="min-w-0 sm:border-l sm:border-border sm:pl-6">{children}</div>
    </li>
  );
}

/**
 * How it works, as one afternoon on the calendar's hour rail: from describing the business to its first booking, with
 * the now line going down the rail as you read.
 */
export function FirstAfternoonSection() {
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="scroll-mt-24 pt-14 pb-16 sm:pt-20 sm:pb-24"
    >
      <PrismContainer>
        <span id="features" className="block scroll-mt-24" />
        {/* The promise and its proof side by side, so the draft is in view as soon as the section is. */}
        <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_49%]">
          <PrismHeading
            id="product-title"
            align="left"
            label="How it works"
            title="Tell us what you do."
            lit="It’s ready this afternoon."
            punch
            lead="Describe your business in a sentence, or paste your website. We set out what you told us, suggest the rest, and nothing goes live until you’ve checked it."
          />
          <ol className="lg:col-start-1 lg:row-start-2">
            <Stop at="14:00" className="last:pb-10 sm:last:pb-12">
              <h3 className="text-lg font-semibold tracking-tight">Describe your business</h3>
              <SetupSentence />
            </Stop>
          </ol>
          <SetupDraft className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-9" />
        </div>
        <div className="relative mt-10 lg:mt-0">
          {/* The now line: it rides down the rail with the page, as the calendar's does with the day. */}
          <div aria-hidden className="absolute inset-y-0 left-[7rem] hidden w-0 sm:block">
            <span className="sticky top-1/2 -ml-[0.3125rem] block size-2.5 rounded-full bg-danger ring-4 ring-background" />
          </div>
          <ol start={2}>
            {STOPS.map(({ at, title, body, pictures }) => (
              <Stop key={title} at={at}>
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_calc((100%+8.5rem)*0.49)] lg:gap-10">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                    <p className="mt-1 text-base leading-[1.5] text-pretty text-muted-foreground">{body}</p>
                  </div>
                  <div aria-hidden className="flex min-w-0 flex-col gap-2">
                    {pictures.map((Picture) => (
                      <Picture key={Picture.name} />
                    ))}
                  </div>
                </div>
              </Stop>
            ))}
          </ol>
        </div>
      </PrismContainer>
    </section>
  );
}
