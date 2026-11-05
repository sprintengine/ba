import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BUSINESS_AI_HELP_PATH } from "@/lib/oauth/app-url";
import { PrismContainer, PrismHeading } from "../heading";
import { AiScene } from "./ai-scene";

const OWNER = [
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
const CUSTOMER = [
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

/** The chores an owner hands over, in the owner's words. */
const ASKS = ["Who hasn't paid this week?", "Close the 24th and tell everyone", "Add a Saturday class"];

function Points({ points, asks }: { points: { title: string; body: string }[]; asks?: string[] }) {
  return (
    <>
      <ul className="flex flex-col gap-5">
        {points.map((p) => (
          <li key={p.title}>
            <h3 className="text-base font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-1 text-[0.9375rem] leading-[1.5] text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ul>
      {asks && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {asks.map((a) => (
            <li
              key={a}
              className="rounded-full bg-surface px-3.5 py-2 text-sm font-medium ring-1 ring-border"
            >
              “{a}”
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Why it's different: connect the AI you already have and run the business through it; clients can book through theirs. */
export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-24 bg-surface-sunken py-20 sm:py-28">
      <PrismContainer className="max-w-[80rem]">
        <AiScene
          heading={
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
              <PrismHeading
                id="ai-title"
                align="left"
                className="max-w-none"
                label="AI"
                title="Use the AI you already have."
                lit="Ask it to run your business."
              />
              <p className="text-base leading-[1.6] text-muted-foreground sm:text-lg lg:pb-1">
                Connect ChatGPT, Claude, Grok or any other assistant, included on every plan. Your clients can
                book through their own assistants too.
              </p>
            </div>
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
          {{ owner: <Points points={OWNER} asks={ASKS} />, customer: <Points points={CUSTOMER} /> }}
        </AiScene>
      </PrismContainer>
    </section>
  );
}
