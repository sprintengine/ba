import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BUSINESS_AI_HELP_PATH } from "@/lib/oauth/app-url";
import { PrismHeading } from "../heading";
import { AiScene } from "./ai-scene";

type Point = { title: string; body: string };

const OWNER: Point[] = [
  {
    title: "Run the whole business by asking",
    body: "Move bookings, change your hours, add a service, see who hasn’t paid. If you can do it in the app, your assistant can do it for you.",
  },
  {
    title: "Connect your own assistant, included",
    body: "It takes a few clicks, and it’s included on every plan. No assistant yet? Ours runs on paid monthly credits.",
  },
  {
    title: "You stay in charge",
    body: "Your assistant asks before it changes anything, until you tell it not to.",
  },
];
const CUSTOMER: Point[] = [
  {
    title: "Their AI can book and pay too",
    body: "Clients ask their own assistant for a time with you, and it books it.",
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

function Points({ points }: { points: Point[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-5 lg:grid-cols-3">
      {points.map((p) => (
        <li key={p.title}>
          <h3 className="text-lg leading-tight font-semibold tracking-tight">{p.title}</h3>
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-muted-foreground">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Why it's different: connect the AI you already have and run the business through it; clients can book through theirs. */
export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-24 py-16 sm:py-24">
      <AiScene
        heading={
          <PrismHeading
            id="ai-title"
            label="AI"
            title="Use the AI you already have."
            lit="Ask it to run your business"
            dot
            lead="It works with ChatGPT, Claude, Grok or any other assistant. Chase payments, move bookings and change your hours by asking."
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
    </section>
  );
}
