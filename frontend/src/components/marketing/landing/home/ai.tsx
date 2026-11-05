import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BUSINESS_AI_HELP_PATH } from "@/lib/oauth/app-url";
import { PrismContainer, PrismHeading } from "../heading";
import { AiScene } from "./ai-scene";

const OWNER = [
  {
    title: "Run the whole business by asking",
    body: "Bookings, staff, services, hours, offers, payments and your booking page. If you can do it in the app, your AI can do it for you.",
  },
  {
    title: "Bring your own AI assistant",
    body: "Connect Claude, ChatGPT or any other assistant in a few clicks, or use the one built in.",
  },
  {
    title: "You stay in charge",
    body: "Each change waits for your approval until you decide it doesn't need to.",
  },
];
const CUSTOMER = [
  {
    title: "Bookable by any AI assistant",
    body: "Clients can ask their own assistant to find a time with you and book it.",
  },
  {
    title: "The same rules as your booking page",
    body: "Assistants see the times, prices and policies your clients do, and nothing more.",
  },
  {
    title: "Booked and paid in the chat",
    body: "The client gets a booking card right in the conversation, confirms and pays, and it lands on your calendar.",
  },
];

function Points({ points }: { points: { title: string; body: string }[] }) {
  return (
    <ul className="flex flex-col gap-6">
      {points.map((p) => (
        <li key={p.title}>
          <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
          <p className="mt-1 text-base leading-[1.55] text-muted-foreground">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Why it's different: the business can be run through an AI, and customers can book through theirs. */
export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-24 bg-surface-sunken py-24 sm:py-32">
      <PrismContainer>
        <AiScene
          heading={
            <PrismHeading
              id="ai-title"
              align="left"
              label="Built for AI"
              title="Your AI runs your business."
              lit="Theirs books with you."
              lead="Run everything through your own AI or ours. Your customers can do the same, booking, moving and paying through the assistants they already use."
            />
          }
        >
          {{ owner: <Points points={OWNER} />, customer: <Points points={CUSTOMER} /> }}
        </AiScene>
        <Link
          href={BUSINESS_AI_HELP_PATH}
          className="focus-ring group mt-10 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold"
        >
          How to connect your assistant
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </PrismContainer>
    </section>
  );
}
