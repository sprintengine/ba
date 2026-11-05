"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDescription } from "@/components/onboarding/draft-storage";

const SENTENCE = "A physio clinic in Dublin. Three physios, three rooms and a rehab gym.";
const DRAFT: { label: string; value: string }[] = [
  { label: "Services", value: "Initial assessment, follow-up, sports massage" },
  { label: "Hours", value: "Mon to Sat, 09:00 to 18:00" },
  { label: "Team", value: "Sam, Aoife and Niamh" },
  { label: "Rooms", value: "Rooms 1 to 3, rehab gym" },
];
const TYPE_MS = 26;
const ROW_MS = 320;

/** How far the demo has got: the sentence types itself the first time it's seen, then the draft fills in. */
function useDrafting(ref: React.RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(SENTENCE.length);
  const [rows, setRows] = useState(DRAFT.length);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    setTyped(0);
    setRows(0);
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        for (let n = 1; n <= SENTENCE.length; n++)
          timers.push(window.setTimeout(() => setTyped(n), n * TYPE_MS));
        const typing = SENTENCE.length * TYPE_MS;
        DRAFT.forEach((_, i) =>
          timers.push(window.setTimeout(() => setRows(i + 1), typing + (i + 1) * ROW_MS)),
        );
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [ref, reduce]);

  return { typed, rows };
}

/** One sentence becoming a setup, and a box to try your own: its words carry through sign-up into the real step. */
export function SetupDraft() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { typed, rows } = useDrafting(ref);
  const [own, setOwn] = useState("");
  const done = rows === DRAFT.length;
  return (
    <div ref={ref} className="mt-12 grid gap-8 sm:mt-14 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col justify-center">
        <p className="relative text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] font-medium tracking-[-0.025em]">
          <span className="invisible">“{SENTENCE}”</span>
          <span className="absolute inset-0">
            “{SENTENCE.slice(0, typed)}
            {typed === SENTENCE.length && "”"}
          </span>
        </p>
        <p
          className={cn(
            "mt-5 flex items-center gap-2 text-[0.9375rem] text-muted-foreground transition-opacity duration-300",
            !done && "opacity-0",
          )}
        >
          <Sparkles className="size-4" aria-hidden /> Drafted from that one sentence
        </p>
        <form
          className="mt-8 flex gap-2 max-sm:flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            saveDescription(own);
            router.push("/sign-up");
          }}
        >
          <Input
            aria-label="Describe your business"
            placeholder="Describe yours, or paste your website"
            value={own}
            maxLength={2000}
            onChange={(e) => setOwn(e.target.value)}
            className="h-12 rounded-[14px] bg-surface sm:flex-1"
          />
          <Button type="submit" variant="primary" size="xl" className="rounded-[14px] font-semibold">
            Set mine up <ArrowRight />
          </Button>
        </form>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8" aria-label="Your draft">
        <dl className="flex flex-col">
          {DRAFT.map((d, i) => (
            <div
              key={d.label}
              className="border-b border-border-subtle py-3 first:pt-0 last:border-0 last:pb-0"
            >
              <dt className="text-sm text-muted-foreground">{d.label}</dt>
              <dd
                className={cn("mt-0.5 font-medium transition-opacity duration-300", i >= rows && "opacity-0")}
              >
                {d.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
