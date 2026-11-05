import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BUSINESS_AI_HELP_PATH } from "@/lib/oauth/app-url";
import { PrismContainer, PrismHeading } from "../heading";
import { AiScene } from "./ai-scene";

type Point = { title: string; body: string };

const OWNER: Point[] = [
  {
    title: "Run the whole business by asking",
    body: "Move bookings, change your hours, add a service, see who hasn't paid. If you can do it in the app, your assistant can do it for you.",
  },
  {
    title: "Bring your own AI assistant",
    body: "Connect ChatGPT, Claude, Grok or any other assistant in a few clicks. It's included on every plan. No assistant yet? You can add ours with monthly credits.",
  },
  {
    title: "You stay in charge",
    body: "Your assistant asks before it changes anything, until you tell it not to.",
  },
];
const CUSTOMER: Point[] = [
  {
    title: "Clients can book through their AI too",
    body: "They ask their own assistant for a time with you, and it books it.",
  },
  {
    title: "Same times and prices as your booking page",
    body: "Their assistant only sees what your booking page shows.",
  },
  {
    title: "Booked and paid in the chat",
    body: "They confirm and pay in the chat, and it lands on your calendar like any other booking.",
  },
];

/** The first point leads, at reading size; the others sit beside it. */
function Points({ points }: { points: Point[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-5 lg:grid-cols-3">
      {points.map((p, i) => (
        <li key={p.title}>
          {i === 0 ? (
            <h3 className="text-xl leading-tight font-semibold tracking-tight">{p.title}</h3>
          ) : (
            <h4 className="text-base font-semibold tracking-tight">{p.title}</h4>
          )}
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-muted-foreground">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Why it's different: connect the AI you already have and run the business through it; clients can book through theirs. */
export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-24 bg-surface-sunken py-20 sm:py-28">
      <PrismContainer>
        <AiScene
          heading={
            <PrismHeading
              id="ai-title"
              label="AI"
              title="Use the AI you already have."
              lit="Ask it to run your business"
              dot
              lead="Connect ChatGPT, Claude, Grok or any other assistant, included on every plan. Your clients can book through their own assistants too."
            />
          }
          footer={
            <Link
              href={BUSINESS_AI_HELP_PATH}
              className="focus-ring group inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold"
            >
              How to connect your assistant
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        >
          {{ owner: <Points points={OWNER} />, customer: <Points points={CUSTOMER} /> }}
        </AiScene>
      </PrismContainer>
    </section>
  );
}
