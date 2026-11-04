import Link from "next/link";
import { ArrowRight, Bot, CalendarSearch, CheckCheck, ScrollText, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Reveal } from "../reveal";
import { PrismContainer, PrismHeading } from "./heading";
import prism from "./prism/prism.module.css";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Same rules as your booking page",
    body: "Assistants see the same times, prices and policies your clients do, and nothing more.",
  },
  {
    icon: Wallet,
    title: "The client confirms and pays",
    body: "Paid services go through your normal Stripe checkout, so money never moves without the client.",
  },
  {
    icon: ScrollText,
    title: "Every action on the record",
    body: "Bookings made by an assistant are marked as such in your audit log, alongside everything else.",
  },
];

/** Clients' own AI assistants (Claude, ChatGPT) find and book the business through our MCP server. */
export function AgentsSection() {
  return (
    <section aria-labelledby="agents-title" className="overflow-hidden py-24 sm:py-32">
      <PrismContainer className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal className="relative order-2 min-w-0 lg:order-1" aria-hidden>
          <div className={cn(prism.glow, "top-1/2 h-[70%] w-[130%] rotate-6")} />
          <Conversation />
        </Reveal>
        <div className="order-1 min-w-0 lg:order-2">
          <PrismHeading
            id="agents-title"
            align="left"
            label={
              <>
                <Bot /> Bookable by AI assistants
              </>
            }
            title="Clients can book you"
            lit="through their AI assistant."
            lead="If a client uses Claude, ChatGPT or another assistant, they can ask it to find a time with you and book it. It connects through bookanything’s MCP server."
          />
          <ul className="mt-10 flex flex-col gap-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface shadow-(--prism-chip-shadow) ring-1 ring-border-subtle [&_svg]:size-[1.125rem]">
                  <Icon />
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
                  <p className="mt-0.5 text-sm leading-normal text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/help/ai-assistant"
            className="focus-ring group mt-8 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-foreground"
          >
            How clients connect their assistant
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PrismContainer>
    </section>
  );
}

function Conversation() {
  return (
    <div className={cn(prism.gl, "rounded-[24px] p-4 sm:p-6")}>
      <div className="flex items-center gap-2 border-b border-(--prism-hairline) pb-4">
        <span className="flex size-7 items-center justify-center rounded-full bg-(--prism-chip) text-muted-foreground shadow-(--prism-ring)">
          <Bot className="size-4" />
        </span>
        <span className="text-sm font-semibold">Your client&apos;s assistant</span>
      </div>
      <div className="mt-5 flex flex-col gap-4 text-sm">
        <UserBubble>Book me a sports massage on Thursday evening, after six if possible.</UserBubble>
        <ToolCall icon={<CalendarSearch />} name="find_availability">
          Sports massage · Thursday · after 18:00
        </ToolCall>
        <AssistantBubble>
          Lumen Physio has <strong className="tnum font-semibold">18:15</strong> or{" "}
          <strong className="tnum font-semibold">19:00</strong> with Sam Rivers. 30 minutes is €40. Shall I
          book 18:15?
        </AssistantBubble>
        <UserBubble>Yes, 18:15 please.</UserBubble>
        <ToolCall icon={<CheckCheck />} name="create_booking" done>
          Held for you · payment link sent
        </ToolCall>
        <AssistantBubble>
          Done. Check your email to pay and confirm. You can reschedule from the same link.
        </AssistantBubble>
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-end gap-2">
      <p className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground">
        {children}
      </p>
      <Avatar name="Orla Kenny" size="sm" />
    </div>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-(--prism-chip) px-3.5 py-2 shadow-(--prism-ring)">
      {children}
    </p>
  );
}

function ToolCall({
  icon,
  name,
  done,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs [&_svg]:size-3.5">
      <span className={done ? "text-success" : "text-muted-foreground"}>{icon}</span>
      <code className="font-mono text-2xs font-semibold text-foreground">{name}</code>
      <span className="truncate text-muted-foreground">{children}</span>
    </div>
  );
}
