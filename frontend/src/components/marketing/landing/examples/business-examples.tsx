"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { EXAMPLE_CARDS, photoSrc, photoSrcSet, type ExampleCard, type ExampleSlug } from "./cards";

const load = () => import("./example-dialog").then((m) => m.ExampleDialog);
/** The calendar, its fixtures and the dialog come with the first card opened, not with the page. */
const ExampleDialog = dynamic(load, { ssr: false });

function Card({
  card,
  onOpen,
  buttonRef,
}: {
  card: ExampleCard;
  onOpen: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        onPointerEnter={() => void load()}
        onFocus={() => void load()}
        className="group focus-ring flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-xs transition-[box-shadow,border-color,translate] duration-200 hover:border-border-strong hover:shadow-lg motion-safe:hover:-translate-y-0.5"
      >
        <span className="relative block aspect-[3/2] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- static WebP in two sizes; next/image is not used */}
          <img
            src={photoSrc(card.photo, 960)}
            srcSet={photoSrcSet(card.photo)}
            sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
            alt={card.alt}
            width={960}
            height={640}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-[scale] duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
          />
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[0.8125rem] font-medium text-white backdrop-blur-sm">
            <Play className="size-3 fill-current" aria-hidden /> See it working
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-0.5 p-5">
          <span className="font-semibold tracking-tight">{card.label}</span>
          <span className="text-sm text-muted-foreground">{card.shape}</span>
          <span className="text-sm text-muted-foreground">{card.types}</span>
        </span>
      </button>
    </li>
  );
}

/** The cards, and the working example each one opens. The five kinds of business are types, never named customers. */
export function BusinessExamples() {
  const [card, setCard] = useState<ExampleCard | null>(null);
  const [open, setOpen] = useState(false);
  const buttons = useRef<Partial<Record<ExampleSlug, HTMLButtonElement | null>>>({});
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLE_CARDS.map((c) => (
          <Card
            key={c.slug}
            card={c}
            buttonRef={(el) => {
              buttons.current[c.slug] = el;
            }}
            onOpen={() => {
              setCard(c);
              setOpen(true);
            }}
          />
        ))}
        <li className="flex flex-col justify-between gap-6 rounded-2xl bg-surface-sunken p-6 sm:p-7">
          <div>
            <h3 className="text-[1.375rem] leading-tight font-semibold tracking-tight">Yours next.</h3>
            <p className="mt-2 text-sm leading-normal text-muted-foreground">
              If you work by appointment, it fits. Describe your business and we&apos;ll draft your
              appointment types, staff and hours for you to check.
            </p>
          </div>
          <Link
            href="/sign-up"
            className="focus-ring group inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-semibold"
          >
            Describe your business
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      </ul>
      {card && (
        <ExampleDialog
          card={card}
          open={open}
          onOpenChange={setOpen}
          returnFocus={() => buttons.current[card.slug]?.focus()}
        />
      )}
    </>
  );
}
