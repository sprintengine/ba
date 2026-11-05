import { CalendarClock, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PrismContainer, PrismHeading } from "../heading";
import { eventFill } from "./scene-parts";

function Tile({
  title,
  body,
  wide,
  children,
}: {
  title: string;
  body: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-6 rounded-2xl border border-border bg-surface p-6 sm:p-7",
        wide && "md:col-span-2",
      )}
    >
      <div className="flex min-h-32 flex-1 flex-col justify-center" aria-hidden>
        {children}
      </div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-[0.9375rem] leading-normal text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

const Row = ({ a, b, c }: { a: string; b: string; c?: string }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 text-sm last:border-0">
    <span className="min-w-0 truncate font-medium">{a}</span>
    <span className="tnum shrink-0 text-muted-foreground">
      {b}
      {c && <span className="ml-3 font-semibold text-foreground">{c}</span>}
    </span>
  </div>
);

const Chip = ({ children, chart }: { children: React.ReactNode; chart: number }) => (
  <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={eventFill(chart)}>
    {children}
  </span>
);

/** Everything else a business sets up, each with a small piece of the product. */
export function SetupSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24 py-24 sm:py-32">
      <PrismContainer>
        <PrismHeading
          id="features-title"
          label="Set up"
          title="Built around how you work,"
          lit="ready this afternoon."
          lead="Describe your business and AI drafts the setup. Then change whatever you like."
        />
        <ul className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-3">
          <Tile
            wide
            title="Create your business"
            body="Tell us what you do, or paste your website. AI drafts your services, prices, hours and booking page for you to check."
          >
            <p className="rounded-xl border border-border bg-background p-4 text-[0.9375rem] leading-normal">
              “A physio clinic in Dublin. Two physios, a rehab gym and a shockwave machine.”
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <Chip chart={1}>4 services</Chip>
              <Chip chart={3}>Opening hours</Chip>
              <Chip chart={6}>Aoife and Sam</Chip>
              <Chip chart={4}>Rehab gym</Chip>
            </div>
          </Tile>
          <Tile
            title="Staff, rooms and equipment"
            body="One calendar for all of it. A booking holds the person and the room, so nothing gets double-booked."
          >
            <div className="flex items-center">
              {["Aoife Byrne", "Sam Rivers", "Niamh Walsh", "Dara Quinn"].map((n) => (
                <Avatar key={n} name={n} className="-mr-1.5 ring-2 ring-surface" />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span className="rounded-lg border border-border px-2.5 py-1">Room 1</span>
              <span className="rounded-lg border border-border px-2.5 py-1">Rehab gym</span>
              <span className="rounded-lg border border-border px-2.5 py-1">Shockwave</span>
            </div>
          </Tile>
          <Tile
            title="Every type of appointment"
            body="Lengths, prices, options, add-ons and your own questions. Classes and group sessions too."
          >
            <Row a="Initial assessment" b="1 h" c="€70" />
            <Row a="Sports massage" b="45 min" c="€45" />
            <Row a="Group rehab class" b="6 places" c="€15" />
          </Tile>
          <Tile
            title="Discounts that fill quiet times"
            body="Run off-peak, last-minute or always-on offers, and pause them whenever you like."
          >
            <Row a="Off-peak Tuesdays" b="10:00 to 12:00" c="−20%" />
            <Row a="Last minute" b="Within 24 hours" c="−15%" />
          </Tile>
          <Tile
            title="Customer groups"
            body="Keep members, students or regulars together, and give them their own times and offers."
          >
            <div className="flex flex-wrap gap-2">
              <Chip chart={1}>Members</Chip>
              <Chip chart={6}>Students</Chip>
              <Chip chart={3}>Regulars</Chip>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" /> Saturday mornings for members only
            </p>
          </Tile>
        </ul>
      </PrismContainer>
    </section>
  );
}
