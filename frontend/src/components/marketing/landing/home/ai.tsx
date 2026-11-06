import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
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

/** One step of a client's own assistant booking. */
function Moment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-[0.9375rem]">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** The other half of the promise, always in view: a client's own assistant books and pays, and it lands the same. */
function ClientsAssistant() {
  return (
    <aside
      aria-label="A client's own assistant booking"
      className="mx-auto mt-10 grid w-[calc(100%-2.5rem)] max-w-[70rem] items-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <Moment label="They ask their own assistant">
        <p className="w-fit rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground">
          Book me a follow-up with Sam on Friday and pay for it.
        </p>
      </Moment>
      <ArrowRight className="mt-9 size-5 text-subtle-foreground max-md:mt-0 max-md:rotate-90" aria-hidden />
      <Moment label="They pay in the chat">
        <div className="rounded-xl border border-border px-3.5 py-2.5">
          <p className="tnum flex justify-between gap-3 font-semibold">
            Follow-up, Fri 15:30 <span>€60</span>
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-3.5 text-success" aria-hidden /> Paid to your account
          </p>
        </div>
      </Moment>
      <ArrowRight className="mt-9 size-5 text-subtle-foreground max-md:mt-0 max-md:rotate-90" aria-hidden />
      <Moment label="It lands on your calendar">
        <div className="rounded-xl bg-[color-mix(in_oklab,#0ea5e9_14%,var(--surface))] px-3.5 py-2.5">
          <p className="font-semibold">Rory Kane</p>
          <p className="tnum text-sm text-muted-foreground">15:30 · Paid €60, through their AI</p>
        </div>
      </Moment>
      <p className="text-sm text-muted-foreground md:col-span-full">
        Their assistant sees only what your booking page shows: the same times, the same prices.
      </p>
    </aside>
  );
}

function Points({ points }: { points: Point[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-5 lg:grid-cols-3">
      {points.map((p) => (
        <li key={p.title}>
          <h3 className="text-lg leading-tight font-semibold tracking-tight">{p.title}</h3>
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-muted-foreground max-sm:hidden">
            {p.body}
          </p>
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
      <ClientsAssistant />
    </section>
  );
}
