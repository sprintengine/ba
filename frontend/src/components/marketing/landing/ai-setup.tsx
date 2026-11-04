import { ArrowDown, Check, Clock, DoorOpen, Lock, Sparkles, UserRound } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { priceLabel } from "@/lib/booking/quote";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { INDUSTRY_CONTENT } from "../industry-content";
import { Reveal } from "../reveal";
import { PrismContainer, PrismHeading } from "./heading";
import prism from "./prism/prism.module.css";

const STEPS = [
  {
    title: "Describe your business",
    body: "A few sentences, or your website address. Say what you offer, who works there and how you like to be paid.",
  },
  {
    title: "Review the draft",
    body: "Go through the services, prices, opening hours, team, rooms and booking questions, and change whatever’s not right.",
  },
  {
    title: "Share your link",
    body: "Your page goes live at bookanything.ie/your-name. Put the link on your website, Instagram or Google profile.",
  },
];

const PROMPT =
  "We're a physio clinic with two physios, Sam and Robin, and two treatment rooms. Initial assessments are an hour for €70, follow-ups 45 minutes for €60, and we do 30 or 60-minute sports massage. Clients pay when they book.";

export function AiSetupSection() {
  const physio = INDUSTRY_CONTENT.physio;
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-24 overflow-hidden py-24 sm:py-32">
      <PrismContainer className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <PrismHeading
            id="ai-title"
            align="left"
            label={
              <>
                <Sparkles /> AI setup
              </>
            }
            title="Tell us what you do,"
            lit="and we’ll draft the setup."
            lead="Write a few lines about your business and AI fills in your services, prices, hours and team for you to check. Nothing goes live until you publish it."
          />
          <ol className="mt-10 flex flex-col gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="tnum flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold shadow-(--prism-chip-shadow) ring-1 ring-border-subtle">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <Reveal className="relative min-w-0" aria-hidden>
          <div className={cn(prism.glow, "top-1/2 h-[70%] w-[130%]")} />
          {/* Prompt */}
          <div className={cn(prism.gl, "rounded-[22px] p-4 sm:p-5")}>
            <p className="text-xs font-medium text-subtle-foreground">Tell us about your business</p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {PROMPT}
              <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-brand" />
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-2xs text-subtle-foreground">Or paste your website address</span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground shadow-button">
                <Sparkles className="size-3.5" /> Draft my setup
              </span>
            </div>
          </div>

          <div className="flex justify-center py-3 text-subtle-foreground">
            <ArrowDown className="size-4" />
          </div>

          {/* Draft */}
          <div className={cn(prism.gl, "rounded-[22px]")}>
            <div className="flex items-center justify-between gap-3 border-b border-(--prism-hairline) px-4 py-3 sm:px-5">
              <p className="truncate text-sm font-semibold">Draft setup</p>
              <Badge tone="brand">
                <Sparkles /> Review before publishing
              </Badge>
            </div>
            <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] sm:p-5">
              <div>
                <p className="text-xs font-medium text-subtle-foreground">Services</p>
                <ul className="mt-2 divide-y divide-(--prism-hairline) rounded-xl bg-(--prism-chip) shadow-(--prism-ring)">
                  {physio.services.map((s) => (
                    <li key={s.name} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="tnum block text-xs text-muted-foreground">
                          {s.options
                            ? s.options.map((o) => formatDuration(o.durationMinutes)).join(" / ")
                            : formatDuration(s.durationMinutes)}
                        </span>
                      </span>
                      <span className="tnum text-sm font-medium">{priceLabel(s, "EUR")}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs font-medium text-subtle-foreground">Team and rooms</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <UserRound className="size-3.5 text-subtle-foreground" /> Sam, Robin
                    </li>
                    <li className="flex items-center gap-2">
                      <DoorOpen className="size-3.5 text-subtle-foreground" /> Treatment rooms 1 and 2
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-subtle-foreground">Hours</p>
                  <p className="tnum mt-2 flex items-center gap-2 text-sm">
                    <Clock className="size-3.5 text-subtle-foreground" /> Mon–Fri, 09:00–17:30
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-subtle-foreground">Booking question</p>
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <Lock className="size-3.5 shrink-0 text-subtle-foreground" />
                    <span className="truncate">What would you like help with?</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-b-[22px] border-t border-(--prism-hairline) bg-(--prism-chip) px-4 py-3 sm:px-5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3.5 text-success" /> Paid online · 24-hour cancellation
              </span>
              <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-button">
                Looks good
              </span>
            </div>
          </div>
        </Reveal>
      </PrismContainer>
    </section>
  );
}
