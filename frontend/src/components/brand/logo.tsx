import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The bookanything mark: the two o's of "book" drawn as one continuous line, an infinity with two true o's in it, in
 * the prism colours from left to right. It is on the logo, the loading animation and the odd empty or success state,
 * and nowhere else: not on assistant features, so it never comes to mean "AI". The letters are Geist SemiBold set
 * tight, converted to outlines so the site doesn't load the font; the line is a stroke of the same weight.
 */
export const PRISM = ["#2fb1e8", "#7a6af0", "#ff8a55"] as const;

/** Stroke widths for one drawing of the line: the letters' own weight, and heavier cuts that hold at small sizes. */
export const WEIGHT = { display: 108, text: 122, small: 170 } as const;
type Weight = keyof typeof WEIGHT;

/** The line and its box, for the symbol on its own. */
const SYMBOL = {
  width: 1079.1,
  height: 620.0,
  line: "M608.9 190.6A208.5 225.0 0 1 1 608.9 429.4L470.2 190.6A208.5 225.0 0 1 0 470.2 429.4Z",
};

/** The word: every letter but the o's, and the line that takes their place, on one baseline. */
export const WORD = {
  width: 6159.1,
  height: 878,
  lineLeft: 620,
  lineRight: 1637.1,
  letters:
    "M357 722Q301 722 259 698Q217 674 195 631L192 710H70V0H198V252Q219 216 260.5 190Q302 164 357 164Q426 164 476.5 198.5Q527 233 554.5 295.5Q582 358 582 443Q582 528 554.5 590.5Q527 653 476.5 687.5Q426 722 357 722ZM328 618Q383 618 416 571.5Q449 525 449 443Q449 360 416.5 314Q384 268 329 268Q267 268 232.5 314Q198 360 198 443Q198 525 232.5 571.5Q267 618 328 618ZM1706.1 710V0H1834.1V417L2053.1 176H2211.1L2002.1 398L2218.1 710H2074.1L1918.1 474L1834.1 563V710ZM2407.1 722Q2323.1 722 2272.1 684Q2221.1 646 2221.1 576Q2221.1 507 2264.1 468Q2307.1 429 2395.1 412L2572.1 377Q2572.1 263 2469.1 263Q2423.1 263 2396.1 284.5Q2369.1 306 2360.1 346L2230.1 340Q2246.1 256 2308.1 210Q2370.1 164 2469.1 164Q2583.1 164 2641.6 221.5Q2700.1 279 2700.1 386V580Q2700.1 601 2707.6 609Q2715.1 617 2730.1 617H2747.1V710Q2730.1 714 2700.1 714Q2657.1 714 2627.1 696Q2597.1 678 2589.1 629V628Q2569.1 670 2520.6 696Q2472.1 722 2407.1 722ZM2433.1 629Q2497.1 629 2534.6 592Q2572.1 555 2572.1 494V464L2434.1 492Q2391.1 501 2372.6 518.5Q2354.1 536 2354.1 564Q2354.1 629 2433.1 629ZM2800.1 710V176H2916.1L2919.1 267Q2941.1 212 2983.6 188Q3026.1 164 3079.1 164Q3167.1 164 3214.1 220.5Q3261.1 277 3261.1 367V710H3133.1V408Q3133.1 340 3112.6 304Q3092.1 268 3040.1 268Q2988.1 268 2958.1 304Q2928.1 340 2928.1 408V710ZM3377.1 860V761H3445.1Q3471.1 761 3483.6 753Q3496.1 745 3503.1 726L3518.1 689H3481.1L3290.1 176H3423.1L3557.1 569L3685.1 176H3818.1L3609.1 766Q3591.1 816 3558.6 838Q3526.1 860 3468.1 860ZM4071.1 710Q3991.1 710 3953.6 673.5Q3916.1 637 3916.1 557V275H3832.1V176H3916.1V51H4044.1V176H4185.1V275H4044.1V545Q4044.1 583 4060.6 597Q4077.1 611 4110.1 611H4185.1V710ZM4241.1 710V0H4369.1V247Q4391.1 205 4431.1 184.5Q4471.1 164 4521.1 164Q4610.1 164 4656.1 220.5Q4702.1 277 4702.1 367V710H4574.1V398Q4574.1 268 4483.1 268Q4430.1 268 4399.6 302Q4369.1 336 4369.1 401V710ZM4806.1 710V176H4934.1V710ZM4804.1 105V-9H4937.1V105ZM5051.1 710V176H5167.1L5170.1 267Q5192.1 212 5234.6 188Q5277.1 164 5330.1 164Q5418.1 164 5465.1 220.5Q5512.1 277 5512.1 367V710H5384.1V408Q5384.1 340 5363.6 304Q5343.1 268 5291.1 268Q5239.1 268 5209.1 304Q5179.1 340 5179.1 408V710ZM5837.1 872Q5732.1 872 5672.1 830Q5612.1 788 5594.1 720L5726.1 711Q5736.1 742 5760.6 758.5Q5785.1 775 5837.1 775Q5896.1 775 5928.1 748.5Q5960.1 722 5960.1 666V598Q5941.1 637 5899.1 660.5Q5857.1 684 5805.1 684Q5739.1 684 5687.6 651.5Q5636.1 619 5607.1 560.5Q5578.1 502 5578.1 425Q5578.1 348 5607.1 289.5Q5636.1 231 5686.6 197.5Q5737.1 164 5803.1 164Q5860.1 164 5902.1 190Q5944.1 216 5964.1 259V176H6089.1V663Q6089.1 766 6020.1 819Q5951.1 872 5837.1 872ZM5835.1 584Q5892.1 584 5926.6 541.5Q5961.1 499 5961.1 424Q5962.1 350 5927.6 307Q5893.1 264 5835.1 264Q5776.1 264 5743.6 307.5Q5711.1 351 5711.1 424Q5711.1 497 5744.6 540.5Q5778.1 584 5835.1 584Z",
  line: "M1197.9 323.6A208.5 225.0 0 1 1 1197.9 562.4L1059.2 323.6A208.5 225.0 0 1 0 1059.2 562.4Z",
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

/** The word, in the text colour with the line in the prism. Size it by height. */
export function Wordmark({
  className,
  mono = false,
  weight = "text",
  ...props
}: React.ComponentProps<"svg"> & MarkProps) {
  const id = useId();
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
        </defs>
      )}
      <path d={WORD.letters} fill="currentColor" />
      <path
        d={WORD.line}
        fill="none"
        stroke={mono ? "currentColor" : `url(#${id})`}
        strokeWidth={WEIGHT[weight]}
      />
    </svg>
  );
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
 * Waiting on a page or a whole section: a thread of light runs round the symbol. With reduced motion it is the still
 * symbol. Decorative: the caller says what's loading. Not for inline spinners.
 */
export function LogoLoader({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox={`0 0 ${SYMBOL.width} ${SYMBOL.height}`}
      aria-hidden
      className={cn("h-9 w-auto shrink-0", className)}
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
