"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { EXAMPLE_CARDS, photoSrc, type ExampleCard } from "./cards";

const FIRST = EXAMPLE_CARDS[0]!;

/** The calendar and its fixtures come as the section gets near, not with the page. */
const ExampleStage = dynamic(() => import("./example-stage").then((m) => m.ExampleStage), {
  ssr: false,
  loading: () => <div className="size-full" />,
});

function Tab({ card, active, onPick }: { card: ExampleCard; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        "focus-ring flex shrink-0 items-center gap-2.5 rounded-xl border p-1.5 pr-3.5 text-left text-sm font-medium transition-colors pointer-coarse:min-h-11",
        active
          ? "border-border-strong bg-surface text-foreground shadow-xs"
          : "border-transparent bg-surface-sunken text-muted-foreground hover:text-foreground",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static WebP; next/image is not used */}
      <img
        src={photoSrc(card.photo, 480)}
        alt={card.alt}
        width={48}
        height={32}
        loading="lazy"
        decoding="async"
        className="h-8 w-12 rounded-md object-cover"
      />
      {card.label}
    </button>
  );
}

/**
 * The kinds of business, and one of them always working on the page: the visitor picks theirs and the same real
 * calendar changes under the tabs. The five are types, never named customers.
 */
export function BusinessExamples() {
  const [card, setCard] = useState(FIRST);
  const [near, setNear] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), {
      rootMargin: "400px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root}>
      <div
        role="group"
        aria-label="Kinds of business"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {EXAMPLE_CARDS.map((c) => (
          <Tab key={c.slug} card={c} active={c.slug === card.slug} onPick={() => setCard(c)} />
        ))}
      </div>
      <div className="mt-4 flex h-[46rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm max-sm:h-[42rem]">
        {near && <ExampleStage card={card} />}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Yours isn’t here? If you work by appointment, it fits.{" "}
        <Link
          href="/sign-up"
          className={cn(
            "focus-ring group inline-flex items-center gap-1 rounded-md font-semibold text-foreground",
            touchHitArea,
          )}
        >
          Describe your business
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </p>
    </div>
  );
}
