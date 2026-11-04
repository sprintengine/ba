import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { cn } from "@/lib/utils";
import {
  AssistantChat,
  BrandSwatches,
  DoubleBooking,
  GroupWindows,
  MiniCalendar,
  SensitiveQuestion,
  TeamList,
  Vocabulary,
} from "./feature-visuals";
import { PrismContainer, PrismHeading } from "./heading";
import s from "./prism/prism.module.css";
import { Tilt } from "./tilt";

type TileSpec = { title: string; body: string; wide?: boolean; visual: React.ReactNode };

const TILES: TileSpec[] = [
  {
    title: "Book the person and the room together",
    body: "A session with Sam holds the rehab gym too, so nobody turns up to find the room taken.",
    wide: true,
    visual: <MiniCalendar />,
  },
  {
    title: "No double bookings",
    body: "The check runs in the database, so it holds even when two people grab the same slot at once.",
    visual: <DoubleBooking />,
  },
  {
    title: `${ASSISTANT_NAME}, an assistant for your team`,
    body: "Ask about your week or have it draft changes. Someone on your team approves each one first.",
    visual: <AssistantChat />,
  },
  {
    title: "Ask what you need to know",
    body: "Add your own questions to the booking form. Mark one sensitive and the answer stays with your team.",
    visual: <SensitiveQuestion />,
  },
  {
    title: "Use the words you already use",
    body: "Patients or students, therapists or bays. Your booking page and dashboard use your terms.",
    visual: <Vocabulary />,
  },
  {
    title: "Your logo and colour",
    body: "Pick a colour and upload a logo. We adjust the text so it stays readable in light and dark mode.",
    visual: <BrandSwatches />,
  },
  {
    title: "A login for everyone on the team",
    body: "Staff see their own diary. Owners and admins see the whole business.",
    visual: <TeamList />,
  },
  {
    title: "Times for members only",
    body: "Hold times for members, medical card holders or new students. Each group only sees the times meant for it.",
    visual: <GroupWindows />,
  },
];

/** The bento: what the product does day to day, each tile a pane of glass over a little light. */
export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="scroll-mt-24 pt-28 pb-24 sm:pt-36 sm:pb-32"
    >
      <PrismContainer>
        <PrismHeading
          id="features-title"
          label="Features"
          title="The same setup works for a two-chair barber"
          lit="and a four-room clinic."
          lead="Set your rules once and every booking follows them, whether it comes from your page, your team or a client’s assistant."
        />
        <div className="mt-14 grid gap-3 sm:mt-16 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {TILES.map((t) => (
            <Tilt
              key={t.title}
              className={cn(
                s.tile,
                "relative flex min-h-[26rem] flex-col overflow-hidden rounded-[28px] max-sm:min-h-[24rem] max-sm:rounded-3xl",
                t.wide && "md:col-span-2",
              )}
            >
              <div className="relative z-[2] px-8 pt-[30px] max-sm:px-6 max-sm:pt-6">
                <h3 className="text-2xl leading-[1.12] font-semibold tracking-[-0.03em] max-sm:text-[1.3125rem]">
                  {t.title}
                </h3>
                <p className="mt-2.5 max-w-[26rem] text-[0.9375rem] leading-normal text-muted-foreground">
                  {t.body}
                </p>
              </div>
              <div
                aria-hidden
                className="relative grid flex-1 place-items-center p-6 max-sm:px-4 max-sm:py-5"
              >
                <div className={s.glow} />
                {t.visual}
              </div>
            </Tilt>
          ))}
        </div>
      </PrismContainer>
    </section>
  );
}
