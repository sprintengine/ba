import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { cn } from "@/lib/utils";
import { Reveal } from "../../reveal";
import { PrismContainer, PrismHeading } from "../heading";
import { BEATS } from "./choreography";
import { CalendarFace } from "./face-calendar";
import { faceVars } from "./face-parts";
import { PhoneFace } from "./face-phone";
import { BoFace, PaymentFace, ReminderFace, TodayFace } from "./faces";
import s from "./prism.module.css";

/** One story beat per face (1…6): what the face beside it shows. */
const BEATS_COPY = [
  {
    label: BEATS[0],
    title: "Today’s bookings and takings,",
    lit: "first thing you see.",
    body: "Who’s coming in, what’s been paid and where there’s still room, as soon as you open the dashboard.",
    face: <TodayFace />,
  },
  {
    label: BEATS[1],
    title: "One calendar for",
    lit: "staff, rooms and equipment.",
    body: "Book Sam, the rehab gym and the shockwave machine in one go. Two bookings can never land on the same person, room or machine.",
    face: <CalendarFace />,
  },
  {
    label: BEATS[2],
    title: "Reminders go out",
    lit: "without you sending them.",
    body: "Clients get an email and a text before every appointment, with a link to change or cancel inside your notice period.",
    face: <ReminderFace />,
  },
  {
    label: BEATS[3],
    title: "Paid straight into",
    lit: "your own Stripe account.",
    body: "Take the full price or a deposit when they book, with any off-peak offer taken off at checkout. We don’t take a percentage.",
    face: <PaymentFace />,
  },
  {
    label: ASSISTANT_NAME,
    title: `Ask ${ASSISTANT_NAME} to sort it out,`,
    lit: "then check before it happens.",
    body: `${ASSISTANT_NAME} answers questions about your week and drafts changes, like moving Sam’s Friday clients to Aoife. Nothing changes until someone on your team approves it.`,
    face: <BoFace />,
  },
  {
    label: "What your clients see",
    title: "Your own booking page,",
    lit: "with Apple Pay and Google Pay.",
    body: "Clients book at bookanything.ie/your-name on their phone or laptop. The ones who use an AI assistant can book through it too.",
    face: <PhoneFace />,
  },
];

/**
 * Straight after the hero: the product in six beats, each a heading beside its face in a pane of glass, alternating
 * sides on wide screens. Ordinary sections: they scroll like the rest of the page and fade up once as they arrive.
 */
export function StoryBeats() {
  return (
    <div id="product" className="scroll-mt-20">
      {BEATS_COPY.map((b, i) => {
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
              </Reveal>
              <Reveal delay={0.08} aria-hidden>
                <div className={s.card} style={faceVars(n)}>
                  <div aria-hidden className={s.glow} />
                  <div className={s.cardFit}>{b.face}</div>
                </div>
              </Reveal>
            </PrismContainer>
          </section>
        );
      })}
    </div>
  );
}
