"use client";

import { useEffect, useState } from "react";
import { AiIcon } from "@/components/brand/logo";
import { useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STEPS = [
  "Reading your description",
  "Drafting services and prices",
  "Setting opening hours",
  "Writing booking questions",
] as const;

const STEP_MS = 1400;

/**
 * Shown while `POST /ai/business-draft` runs. Steps advance on a timer (the last one waits for
 * the response); once `done`, the remaining steps tick off quickly and `onFinished` fires.
 */
export function GeneratingState({
  description,
  done,
  onFinished,
}: {
  description: string;
  done: boolean;
  onFinished: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);

  // Advance through the steps while we wait; hold on the last one until the draft arrives.
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setActive((i) => Math.min(i + 1, STEPS.length - 1)), STEP_MS);
    return () => window.clearInterval(id);
  }, [done]);

  // Once the draft is back, finish the list briskly, then hand over.
  useEffect(() => {
    if (!done) return;
    if (reduceMotion) {
      const id = window.setTimeout(onFinished, 150);
      return () => window.clearTimeout(id);
    }
    if (active < STEPS.length) {
      const id = window.setTimeout(() => setActive((i) => i + 1), 260);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(onFinished, 450);
    return () => window.clearTimeout(id);
  }, [done, active, reduceMotion, onFinished]);

  const excerpt = description.length > 160 ? `${description.slice(0, 157).trimEnd()}…` : description;

  return (
    <div className="mx-auto flex w-full max-w-2xl animate-rise flex-col gap-8" aria-live="polite">
      <div className="flex flex-col items-start gap-4">
        <span className="relative flex size-12 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-brand/25 [animation-duration:1.8s] motion-safe:animate-ping"
          />
          <span className="relative flex size-12 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-button">
            <AiIcon className="h-4!" />
          </span>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Drafting your setup</h1>
          <p className="text-base text-pretty text-muted-foreground">
            This usually takes a few seconds. You&rsquo;ll be able to change everything next.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <blockquote className="border-b border-border-subtle bg-surface-sunken/60 px-5 py-4 text-sm text-muted-foreground italic">
          &ldquo;{excerpt}&rdquo;
        </blockquote>
        <ol className="flex flex-col gap-1 p-3">
          {STEPS.map((label, i) => {
            const state = i < active || (done && i <= active) ? "done" : i === active ? "active" : "todo";
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-300",
                  state === "active" && "bg-accent/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                    state === "done" && "border-transparent bg-brand text-brand-foreground",
                    state === "active" && "border-brand-border bg-brand-soft",
                    state === "todo" && "border-border",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5 motion-safe:animate-pop-in" strokeWidth={2.5} />
                  ) : state === "active" ? (
                    <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "transition-colors duration-300",
                    state === "todo" ? "text-subtle-foreground" : "text-foreground",
                    state === "active" && "font-medium",
                  )}
                >
                  {label}
                  {state === "active" && <span className="sr-only"> (in progress)</span>}
                  {state === "done" && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* A ghost of what's coming: the review page's shape. */}
      <div aria-hidden className="flex flex-col gap-3 opacity-80">
        {[0, 1].map((card) => (
          <div key={card} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 w-32" />
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className={cn("h-3.5", row === 1 ? "w-2/5" : "w-1/2")} />
                <Skeleton className="ml-auto h-3.5 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
