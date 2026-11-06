import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The bookanything mark: the two o's of "book" drawn as one continuous line, an infinity with two true o's in it, each
 * the size and weight of the word's own o, in one prism gradient, and the word ends in a lit full stop. The letters are
 * Geist SemiBold set tight, converted to outlines so the site doesn't load the font. The line is a stroke: the same
 * drawing at every size, with a heavier cut for the small spots. The full stop belongs to the word, not the symbol.
 * One colour on buttons; the prism on the logo and the AI badge.
 */
export const PRISM = ["#2fb1e8", "#7a6af0", "#ff8a55"] as const;

/** Stroke widths: the letters' own weight, and a heavier cut that holds at small sizes. */
export const WEIGHT = { display: 108, text: 122, small: 160 } as const;
type Weight = keyof typeof WEIGHT;

/** The line in its box, for the symbol on its own: out of the crossing, round one o, back through it, round the other. */
export const SYMBOL = {
  width: 1087.0,
  height: 620.0,
  line: "M543.5 310.0C616.2 202.2 643.5 85.0 793.5 85.0C908.7 85.0 1002.0 185.7 1002.0 310.0C1002.0 434.3 908.7 535.0 793.5 535.0C643.5 535.0 616.2 417.8 543.5 310.0C470.8 202.2 443.5 85.0 293.5 85.0C178.3 85.0 85.0 185.7 85.0 310.0C85.0 434.3 178.3 535.0 293.5 535.0C443.5 535.0 470.8 417.8 543.5 310.0Z",
};

/** The word: every letter but the o's, the line that takes their place, and the full stop, on one baseline. */
export const WORD = {
  width: 6305.0,
  height: 878,
  lineLeft: 613,
  lineRight: 1652,
  dot: { cx: 6223.0, cy: 636, r: 80 },
  letters:
    "M357 722Q301 722 259 698Q217 674 195 631L192 710H70V0H198V252Q219 216 260.5 190Q302 164 357 164Q426 164 476.5 198.5Q527 233 554.5 295.5Q582 358 582 443Q582 528 554.5 590.5Q527 653 476.5 687.5Q426 722 357 722ZM328 618Q383 618 416 571.5Q449 525 449 443Q449 360 416.5 314Q384 268 329 268Q267 268 232.5 314Q198 360 198 443Q198 525 232.5 571.5Q267 618 328 618ZM1714 710V0H1842V417L2061 176H2219L2010 398L2226 710H2082L1926 474L1842 563V710ZM2415 722Q2331 722 2280 684Q2229 646 2229 576Q2229 507 2272 468Q2315 429 2403 412L2580 377Q2580 263 2477 263Q2431 263 2404 284.5Q2377 306 2368 346L2238 340Q2254 256 2316 210Q2378 164 2477 164Q2591 164 2649.5 221.5Q2708 279 2708 386V580Q2708 601 2715.5 609Q2723 617 2738 617H2755V710Q2738 714 2708 714Q2665 714 2635 696Q2605 678 2597 629V628Q2577 670 2528.5 696Q2480 722 2415 722ZM2441 629Q2505 629 2542.5 592Q2580 555 2580 494V464L2442 492Q2399 501 2380.5 518.5Q2362 536 2362 564Q2362 629 2441 629ZM2808 710V176H2924L2927 267Q2949 212 2991.5 188Q3034 164 3087 164Q3175 164 3222 220.5Q3269 277 3269 367V710H3141V408Q3141 340 3120.5 304Q3100 268 3048 268Q2996 268 2966 304Q2936 340 2936 408V710ZM3385 860V761H3453Q3479 761 3491.5 753Q3504 745 3511 726L3526 689H3489L3298 176H3431L3565 569L3693 176H3826L3617 766Q3599 816 3566.5 838Q3534 860 3476 860ZM4079 710Q3999 710 3961.5 673.5Q3924 637 3924 557V275H3840V176H3924V51H4052V176H4193V275H4052V545Q4052 583 4068.5 597Q4085 611 4118 611H4193V710ZM4249 710V0H4377V247Q4399 205 4439 184.5Q4479 164 4529 164Q4618 164 4664 220.5Q4710 277 4710 367V710H4582V398Q4582 268 4491 268Q4438 268 4407.5 302Q4377 336 4377 401V710ZM4814 710V176H4942V710ZM4812 105V-9H4945V105ZM5059 710V176H5175L5178 267Q5200 212 5242.5 188Q5285 164 5338 164Q5426 164 5473 220.5Q5520 277 5520 367V710H5392V408Q5392 340 5371.5 304Q5351 268 5299 268Q5247 268 5217 304Q5187 340 5187 408V710ZM5845 872Q5740 872 5680 830Q5620 788 5602 720L5734 711Q5744 742 5768.5 758.5Q5793 775 5845 775Q5904 775 5936 748.5Q5968 722 5968 666V598Q5949 637 5907 660.5Q5865 684 5813 684Q5747 684 5695.5 651.5Q5644 619 5615 560.5Q5586 502 5586 425Q5586 348 5615 289.5Q5644 231 5694.5 197.5Q5745 164 5811 164Q5868 164 5910 190Q5952 216 5972 259V176H6097V663Q6097 766 6028 819Q5959 872 5845 872ZM5843 584Q5900 584 5934.5 541.5Q5969 499 5969 424Q5970 350 5935.5 307Q5901 264 5843 264Q5784 264 5751.5 307.5Q5719 351 5719 424Q5719 497 5752.5 540.5Q5786 584 5843 584Z",
  line: "M1132.5 443.0C1205.2 335.2 1232.5 218.0 1382.5 218.0C1497.7 218.0 1591.0 318.7 1591.0 443.0C1591.0 567.3 1497.7 668.0 1382.5 668.0C1232.5 668.0 1205.2 550.8 1132.5 443.0C1059.8 335.2 1032.5 218.0 882.5 218.0C767.3 218.0 674.0 318.7 674.0 443.0C674.0 567.3 767.3 668.0 882.5 668.0C1032.5 668.0 1059.8 550.8 1132.5 443.0Z",
};

function Prism({ id, x1, x2 }: { id: string; x1: number; x2: number }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1={0} y2={0}>
      {PRISM.map((color, i) => (
        <stop key={color} offset={i / (PRISM.length - 1)} stopColor={color} />
      ))}
    </linearGradient>
  );
}

type MarkProps = {
  /** One colour (currentColor) instead of the prism. */
  mono?: boolean;
  weight?: Weight;
};

/** The symbol alone. Size it by height. Give `title=""` with `aria-hidden` when words beside it already say the name. */
export function LogoMark({
  className,
  title = "bookanything",
  mono = false,
  weight = "text",
  ...props
}: React.ComponentProps<"svg"> & MarkProps & { title?: string }) {
  const id = useId();
  return (
    <svg
      viewBox={`0 0 ${SYMBOL.width} ${SYMBOL.height}`}
      role="img"
      aria-label={title}
      className={cn("h-5 w-auto shrink-0", className)}
      {...props}
    >
      {!mono && (
        <defs>
          <Prism id={id} x1={0} x2={SYMBOL.width} />
        </defs>
      )}
      <path
        d={SYMBOL.line}
        fill="none"
        stroke={mono ? "currentColor" : `url(#${id})`}
        strokeWidth={WEIGHT[weight]}
      />
    </svg>
  );
}

/** The word, in the text colour with the line and the full stop lit. Size it by height. */
export function Wordmark({
  className,
  mono = false,
  weight = "text",
  ...props
}: React.ComponentProps<"svg"> & Omit<MarkProps, "weight"> & { weight?: "display" | "text" }) {
  const id = useId();
  const { cx, cy, r } = WORD.dot;
  return (
    <svg
      viewBox={`0 0 ${WORD.width} ${WORD.height}`}
      role="img"
      aria-label="bookanything"
      className={cn("h-5 w-auto", className)}
      {...props}
    >
      {!mono && (
        <defs>
          <Prism id={id} x1={WORD.lineLeft} x2={WORD.lineRight} />
          <Prism id={`${id}-dot`} x1={cx - r} x2={cx + r} />
        </defs>
      )}
      <path d={WORD.letters} fill="currentColor" />
      <path
        d={WORD.line}
        fill="none"
        stroke={mono ? "currentColor" : `url(#${id})`}
        strokeWidth={WEIGHT[weight]}
      />
      <circle cx={cx} cy={cy} r={r} fill={mono ? "currentColor" : `url(#${id}-dot)`} />
    </svg>
  );
}

/** Marks something an assistant did or drafted: the symbol in the prism, small, beside the words. */
export function AiBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <LogoMark className="h-3 w-auto" weight="small" aria-hidden title="" />
      {children}
    </span>
  );
}

/** The symbol on a button that hands something to an assistant: one colour, in the button's text colour. */
export function AiIcon({ className }: { className?: string }) {
  return <LogoMark className={cn("h-3! w-auto!", className)} mono weight="small" aria-hidden title="" />;
}

/** The logo, at the sizes the shells use. */
export function Logo({
  className,
  size = "md",
  mono,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  mono?: boolean;
}) {
  const height = { sm: "h-[1.125rem]", md: "h-[1.375rem]", lg: "h-7" }[size];
  return (
    <span className={cn("inline-flex items-center text-foreground", className)}>
      <Wordmark className={height} mono={mono} />
    </span>
  );
}

/**
 * Waiting on a page or a whole section: a thread of light runs along the infinity. With reduced motion it is the still
 * symbol. Decorative: the caller says what's loading. Not for inline spinners.
 */
export function LogoLoader({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox={`0 0 ${SYMBOL.width} ${SYMBOL.height}`}
      aria-hidden
      className={cn("h-11 w-auto shrink-0", className)}
      fill="none"
      strokeWidth={WEIGHT.text}
    >
      <defs>
        <Prism id={id} x1={0} x2={SYMBOL.width} />
      </defs>
      <path d={SYMBOL.line} stroke="var(--border)" />
      <path
        d={SYMBOL.line}
        pathLength={100}
        stroke={`url(#${id})`}
        strokeLinecap="round"
        className="animate-logo-thread [stroke-dasharray:28_72] motion-reduce:animate-none motion-reduce:[stroke-dasharray:none]"
      />
    </svg>
  );
}

/**
 * The mark where a page has nothing else to show: a dead end's icon, larger than the line icon it stands in for. The
 * empty state's icon slot sizes what it holds, so this asks for its own size firmly.
 */
export function DeadEndMark() {
  return <LogoMark aria-hidden title="" className="h-8! w-auto!" />;
}
