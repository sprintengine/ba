import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { assistantMarketed } from "@/lib/assistant/flag";
import { BUSINESS_AI_HELP_PATH, businessAgentsLive } from "@/lib/oauth/app-url";
import { cn } from "@/lib/utils";
import { Reveal } from "../../reveal";
import { PrismContainer, PrismHeading } from "../heading";
import { CalendarFace } from "./face-calendar";
import { faceVars } from "./face-parts";
import { PhoneFace } from "./face-phone";
import { BoFace, OwnAssistantFace, PaymentFace, ReminderFace, TodayFace } from "./faces";
import { FitCard } from "./fit-card";
import s from "./prism.module.css";

type Beat = {
  label: string;
  title: string;
  lit: string;
  body: string;
  /** Its face in the choreography tables (1–6), which sizes the card. */
  index: number;
  face: React.ReactNode;
  /** A link under the copy, to read more. */
  more?: { href: string; label: string };
};

const TODAY: Beat = {
  label: "Today",
  title: "Today’s bookings and takings,",
  lit: "first thing you see.",
  body: "Who’s coming in, what’s been paid and where there’s still room, as soon as you open the dashboard.",
  index: 1,
  face: <TodayFace />,
};
const CALENDAR: Beat = {
  label: "Calendar",
  title: "One calendar for",
  lit: "staff, rooms and equipment.",
  body: "Book Sam, the rehab gym and the shockwave machine in one go. Two bookings can never land on the same person, room or machine.",
  index: 2,
  face: <CalendarFace />,
};
const REMINDERS: Beat = {
  label: "Reminders",
  title: "Reminders go out",
  lit: "without you sending them.",
  body: "Clients get an email and a text before every appointment, with a link to change or cancel inside your notice period.",
  index: 3,
  face: <ReminderFace />,
};
const PAYMENTS: Beat = {
  label: "Payments",
  title: "Paid straight into",
  lit: "your own Stripe account.",
  body: "Take the full price or a deposit when they book, with any off-peak offer taken off at checkout. We don’t take a percentage.",
  index: 4,
  face: <PaymentFace />,
};
const BO: Beat = {
  label: ASSISTANT_NAME,
  title: `Ask ${ASSISTANT_NAME} to sort it out,`,
  lit: "then check before it happens.",
  body: `${ASSISTANT_NAME} answers questions about your week and drafts changes, like moving Sam’s Friday clients to Aoife. Nothing changes until someone on your team approves it.`,
  index: 5,
  face: <BoFace />,
};
const OWN_ASSISTANT: Beat = {
  label: "Your AI assistant",
  title: "Ask your own AI assistant,",
  lit: "then approve what it changes.",
  body: "Connect Claude, ChatGPT or another assistant to bookanything. It answers questions about your week and prepares changes, like moving Sam’s Friday clients to Aoife. By default, nothing changes until it’s approved on bookanything.",
  index: 5,
  face: <OwnAssistantFace />,
  more: { href: BUSINESS_AI_HELP_PATH, label: "How to connect your assistant" },
};
const CLIENTS: Beat = {
  label: "What your clients see",
  title: "Your own booking page,",
  lit: "with Apple Pay and Google Pay.",
  body: "Clients book at bookanything.ie/your-name on their phone or laptop. The ones who use an AI assistant can book through it too.",
  index: 6,
  face: <PhoneFace />,
};

/**
 * The beats in order. The fifth is Bo where the public pages present it, else the owner's own assistant on the
 * business server; with neither on it is left out, and the beats after it close up (each keeps its own face).
 */
function beats(): Beat[] {
  const assistant = assistantMarketed() ? BO : businessAgentsLive() ? OWN_ASSISTANT : null;
  return [TODAY, CALENDAR, REMINDERS, PAYMENTS, ...(assistant ? [assistant] : []), CLIENTS];
}

/**
 * Straight after the hero: the product in six beats (five with no assistant to show), each a heading beside its face
 * in a pane of glass, alternating sides on wide screens. Ordinary sections: they scroll like the rest of the page and
 * fade up once as they arrive.
 */
export function StoryBeats() {
  return (
    <div id="product" className="scroll-mt-20">
      {beats().map((b, i) => {
        const n = i + 1;
        return (
          <section
            key={b.title}
            id={`s${n}`}
            aria-labelledby={`s${n}-title`}
            className="scroll-mt-24 pt-24 sm:pt-32"
          >
            <PrismContainer className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
                <PrismHeading
                  id={`s${n}-title`}
                  align="left"
                  label={
                    <>
                      {b.label}
                      <span className="tnum text-xs font-medium text-subtle-foreground">
                        {String(n).padStart(2, "0")}
                      </span>
                    </>
                  }
                  title={b.title}
                  lit={b.lit}
                  lead={b.body}
                />
                {b.more && (
                  <Link
                    href={b.more.href}
                    className="focus-ring group mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-foreground"
                  >
                    {b.more.label}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )}
              </Reveal>
              <Reveal delay={0.08} aria-hidden>
                <FitCard style={faceVars(b.index)}>
                  <div aria-hidden className={s.glow} />
                  <div className={s.cardFit}>{b.face}</div>
                </FitCard>
              </Reveal>
            </PrismContainer>
          </section>
        );
      })}
    </div>
  );
}
