import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The bookanything mark: the two o's of "book" drawn as two interlocked rings, the size and weight of the word's own
 * o, with one prism gradient across both, and the word ends in a lit full stop. The letters are Geist SemiBold set
 * tight, converted to outlines so the site doesn't load the font. The rings are strokes, each cut where it goes under
 * the other. At the small weight there's no room for a weave: the rings sit further apart, so both counters stay open.
 * The full stop belongs to the word, not the symbol. One colour on buttons; the prism on the logo and the AI badge.
 */
export const PRISM = ["#2fb1e8", "#7a6af0", "#ff8a55"] as const;

/** Stroke widths: the letters' own weight, and heavier cuts that hold at small sizes. */
export const WEIGHT = { display: 108, text: 122, small: 170 } as const;
type Weight = keyof typeof WEIGHT;
/** The clear space either side of the ring that passes over. */
export const WEAVE_GAP = 14;

type RingPaths = { left: string; right: string; cutLeft: string; cutRight: string };

/** The rings in their box, for the symbol on its own. */
const SYMBOL = {
  width: 877.0,
  height: 620.0,
  rings: {
    left: "M85.0 310.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0Z",
    right: "M375.0 310.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0Z",
    cutLeft: "M590.0 85.1A208.5 225.0 0 0 0 375.0 310.0",
    cutRight: "M287.0 534.9A208.5 225.0 0 0 0 502.0 310.0",
  } satisfies RingPaths,
  /** The small cut, in a box of its own: the same height, wider. */
  small: {
    width: 987.0,
    line: "M85.0 310.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0ZM485.0 310.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0Z",
  },
  /** Round one ring and then the other, in one go, for the loader. */
  thread:
    "M438.5 148.3A208.5 225.0 0 1 0 438.5 471.7A208.5 225.0 0 0 0 438.5 148.3A208.5 225.0 0 1 1 438.5 471.7A208.5 225.0 0 0 1 438.5 148.3",
};

/** The word: every letter but the o's, the rings that take their place, and the full stop, on one baseline. */
export const WORD = {
  width: 6095.0,
  height: 878,
  ringsLeft: 620,
  ringsRight: 1435.0,
  dot: { cx: 6013.0, cy: 636, r: 80 },
  letters:
    "M357 722Q301 722 259 698Q217 674 195 631L192 710H70V0H198V252Q219 216 260.5 190Q302 164 357 164Q426 164 476.5 198.5Q527 233 554.5 295.5Q582 358 582 443Q582 528 554.5 590.5Q527 653 476.5 687.5Q426 722 357 722ZM328 618Q383 618 416 571.5Q449 525 449 443Q449 360 416.5 314Q384 268 329 268Q267 268 232.5 314Q198 360 198 443Q198 525 232.5 571.5Q267 618 328 618ZM1504 710V0H1632V417L1851 176H2009L1800 398L2016 710H1872L1716 474L1632 563V710ZM2205 722Q2121 722 2070 684Q2019 646 2019 576Q2019 507 2062 468Q2105 429 2193 412L2370 377Q2370 263 2267 263Q2221 263 2194 284.5Q2167 306 2158 346L2028 340Q2044 256 2106 210Q2168 164 2267 164Q2381 164 2439.5 221.5Q2498 279 2498 386V580Q2498 601 2505.5 609Q2513 617 2528 617H2545V710Q2528 714 2498 714Q2455 714 2425 696Q2395 678 2387 629V628Q2367 670 2318.5 696Q2270 722 2205 722ZM2231 629Q2295 629 2332.5 592Q2370 555 2370 494V464L2232 492Q2189 501 2170.5 518.5Q2152 536 2152 564Q2152 629 2231 629ZM2598 710V176H2714L2717 267Q2739 212 2781.5 188Q2824 164 2877 164Q2965 164 3012 220.5Q3059 277 3059 367V710H2931V408Q2931 340 2910.5 304Q2890 268 2838 268Q2786 268 2756 304Q2726 340 2726 408V710ZM3175 860V761H3243Q3269 761 3281.5 753Q3294 745 3301 726L3316 689H3279L3088 176H3221L3355 569L3483 176H3616L3407 766Q3389 816 3356.5 838Q3324 860 3266 860ZM3869 710Q3789 710 3751.5 673.5Q3714 637 3714 557V275H3630V176H3714V51H3842V176H3983V275H3842V545Q3842 583 3858.5 597Q3875 611 3908 611H3983V710ZM4039 710V0H4167V247Q4189 205 4229 184.5Q4269 164 4319 164Q4408 164 4454 220.5Q4500 277 4500 367V710H4372V398Q4372 268 4281 268Q4228 268 4197.5 302Q4167 336 4167 401V710ZM4604 710V176H4732V710ZM4602 105V-9H4735V105ZM4849 710V176H4965L4968 267Q4990 212 5032.5 188Q5075 164 5128 164Q5216 164 5263 220.5Q5310 277 5310 367V710H5182V408Q5182 340 5161.5 304Q5141 268 5089 268Q5037 268 5007 304Q4977 340 4977 408V710ZM5635 872Q5530 872 5470 830Q5410 788 5392 720L5524 711Q5534 742 5558.5 758.5Q5583 775 5635 775Q5694 775 5726 748.5Q5758 722 5758 666V598Q5739 637 5697 660.5Q5655 684 5603 684Q5537 684 5485.5 651.5Q5434 619 5405 560.5Q5376 502 5376 425Q5376 348 5405 289.5Q5434 231 5484.5 197.5Q5535 164 5601 164Q5658 164 5700 190Q5742 216 5762 259V176H5887V663Q5887 766 5818 819Q5749 872 5635 872ZM5633 584Q5690 584 5724.5 541.5Q5759 499 5759 424Q5760 350 5725.5 307Q5691 264 5633 264Q5574 264 5541.5 307.5Q5509 351 5509 424Q5509 497 5542.5 540.5Q5576 584 5633 584Z",
  rings: {
    left: "M674.0 443.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0Z",
    right: "M964.0 443.0a208.5 225.0 0 1 1 417.0 0a208.5 225.0 0 1 1 -417.0 0Z",
    cutLeft: "M1179.0 218.1A208.5 225.0 0 0 0 964.0 443.0",
    cutRight: "M876.0 667.9A208.5 225.0 0 0 0 1091.0 443.0",
  } satisfies RingPaths,
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

/** The two rings, woven: each hides the stretch where the other passes over it. */
function WovenRings({
  id,
  rings,
  stroke,
  strokeWidth,
  width,
  height,
}: {
  id: string;
  rings: RingPaths;
  stroke: string;
  strokeWidth: number;
  width: number;
  height: number;
}) {
  const sides = [
    ["left", rings.left, rings.cutLeft],
    ["right", rings.right, rings.cutRight],
  ] as const;
  return (
    <>
      <defs>
        {sides.map(([side, , cut]) => (
          <mask
            key={side}
            id={`${id}-${side}`}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <rect width={width} height={height} fill="#fff" />
            <path d={cut} fill="none" stroke="#000" strokeWidth={strokeWidth + 2 * WEAVE_GAP} />
          </mask>
        ))}
      </defs>
      {sides.map(([side, ring]) => (
        <path
          key={side}
          d={ring}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          mask={`url(#${id}-${side})`}
        />
      ))}
    </>
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
  const small = weight === "small";
  const width = small ? SYMBOL.small.width : SYMBOL.width;
  const stroke = mono ? "currentColor" : `url(#${id})`;
  return (
    <svg
      viewBox={`0 0 ${width} ${SYMBOL.height}`}
      role="img"
      aria-label={title}
      className={cn("h-5 w-auto shrink-0", className)}
      {...props}
    >
      {!mono && (
        <defs>
          <Prism id={id} x1={0} x2={width} />
        </defs>
      )}
      {small ? (
        <path d={SYMBOL.small.line} fill="none" stroke={stroke} strokeWidth={WEIGHT.small} />
      ) : (
        <WovenRings
          id={id}
          rings={SYMBOL.rings}
          stroke={stroke}
          strokeWidth={WEIGHT[weight]}
          width={width}
          height={SYMBOL.height}
        />
      )}
    </svg>
  );
}

/** The word, in the text colour with the rings and the full stop lit. Size it by height. */
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
          <Prism id={id} x1={WORD.ringsLeft} x2={WORD.ringsRight} />
          <Prism id={`${id}-dot`} x1={cx - r} x2={cx + r} />
        </defs>
      )}
      <path d={WORD.letters} fill="currentColor" />
      <WovenRings
        id={id}
        rings={WORD.rings}
        stroke={mono ? "currentColor" : `url(#${id})`}
        strokeWidth={WEIGHT[weight]}
        width={WORD.width}
        height={WORD.height}
      />
      <circle cx={cx} cy={cy} r={r} fill={mono ? "currentColor" : `url(#${id}-dot)`} />
    </svg>
  );
}

/** Marks something an assistant did or drafted: the rings in the prism, small, beside the words. */
export function AiBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <LogoMark className="h-3.5 w-auto" aria-hidden title="" />
      {children}
    </span>
  );
}

/** The rings on a button that hands something to an assistant: one colour, in the button's text colour. */
export function AiIcon({ className }: { className?: string }) {
  return <LogoMark className={cn("h-3.5! w-auto!", className)} mono aria-hidden title="" />;
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
 * Waiting on a page or a whole section: a thread of light runs round the rings. With reduced motion it is the still
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
      <path d={SYMBOL.thread} stroke="var(--border)" />
      <path
        d={SYMBOL.thread}
        pathLength={100}
        stroke={`url(#${id})`}
        strokeLinecap="round"
        className="animate-logo-thread [stroke-dasharray:28_72] motion-reduce:animate-none motion-reduce:[stroke-dasharray:none]"
      />
    </svg>
  );
}
