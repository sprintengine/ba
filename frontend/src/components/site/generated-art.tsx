import type { GeneratedPattern } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Built-in generated backgrounds (§15.7): drawn from the theme's brand and highlight tokens, so
 * they follow the palette, the theme and light/dark with no external assets. `tone="deep"` is a
 * dark rendition for text on top (cover heroes, call-to-action bands).
 */
export function GeneratedArt({
  pattern,
  tone = "soft",
  className,
}: {
  pattern: GeneratedPattern;
  tone?: "soft" | "deep";
  className?: string;
}) {
  const Art = ART[pattern];
  return (
    <div
      aria-hidden
      data-pattern={pattern}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ background: tone === "deep" ? DEEP_BASE : SOFT_BASE }}
    >
      <Art tone={tone} />
    </div>
  );
}

type ArtProps = { tone: "soft" | "deep" };

const SOFT_BASE = "color-mix(in oklab, var(--brand-soft) 70%, var(--surface))";
const DEEP_BASE = "color-mix(in oklab, var(--brand) 38%, #07080a)";

const a = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`;

function Aurora({ tone }: ArtProps) {
  const k = tone === "deep" ? 1.2 : 1;
  return (
    <>
      <div
        className="absolute -inset-[20%] blur-3xl"
        style={{
          background: [
            `radial-gradient(40% 45% at 22% 30%, ${a("var(--brand)", 55 * k)}, transparent 70%)`,
            `radial-gradient(38% 40% at 78% 24%, ${a("var(--highlight-fill)", 45 * k)}, transparent 70%)`,
            `radial-gradient(45% 50% at 60% 82%, ${a("var(--brand)", 35 * k)}, transparent 70%)`,
            `radial-gradient(30% 35% at 12% 88%, ${a("var(--highlight-fill)", 30 * k)}, transparent 70%)`,
          ].join(","),
        }}
      />
      <Grain />
    </>
  );
}

function Mesh({ tone }: ArtProps) {
  const k = tone === "deep" ? 1.1 : 0.9;
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(at 0% 0%, ${a("var(--brand)", 60 * k)} 0, transparent 50%)`,
            `radial-gradient(at 100% 0%, ${a("var(--highlight-fill)", 45 * k)} 0, transparent 55%)`,
            `radial-gradient(at 100% 100%, ${a("var(--brand)", 50 * k)} 0, transparent 50%)`,
            `radial-gradient(at 0% 100%, ${a("var(--highlight-fill)", 35 * k)} 0, transparent 50%)`,
          ].join(","),
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `linear-gradient(115deg, transparent 40%, ${a("var(--surface)", tone === "deep" ? 8 : 35)} 50%, transparent 60%)`,
        }}
      />
      <Grain />
    </>
  );
}

function Waves({ tone }: ArtProps) {
  const layers = [
    {
      d: "M0 210 C 180 150 320 270 520 210 S 860 150 1000 200 L1000 400 L0 400 Z",
      fill: "var(--brand)",
      o: 0.22,
    },
    {
      d: "M0 250 C 200 200 360 320 560 260 S 880 210 1000 250 L1000 400 L0 400 Z",
      fill: "var(--highlight-fill)",
      o: 0.2,
    },
    {
      d: "M0 300 C 220 250 420 360 620 300 S 900 270 1000 300 L1000 400 L0 400 Z",
      fill: "var(--brand)",
      o: 0.3,
    },
    {
      d: "M0 340 C 240 310 460 390 660 340 S 920 320 1000 345 L1000 400 L0 400 Z",
      fill: "var(--brand)",
      o: 0.45,
    },
  ];
  const boost = tone === "deep" ? 1.5 : 1;
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 70% 20%, ${a("var(--highlight-fill)", tone === "deep" ? 30 : 22)}, transparent 70%)`,
        }}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[85%] w-full"
        viewBox="0 0 1000 400"
        preserveAspectRatio="none"
      >
        {layers.map((l, i) => (
          <path key={i} d={l.d} style={{ fill: l.fill, opacity: Math.min(1, l.o * boost) }} />
        ))}
      </svg>
    </>
  );
}

function GridArt({ tone }: ArtProps) {
  const line = tone === "deep" ? "color-mix(in oklab, white 12%, transparent)" : a("var(--brand)", 16);
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(75% 75% at 65% 40%, black, transparent 80%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(35% 40% at 68% 38%, ${a("var(--brand)", tone === "deep" ? 55 : 30)}, transparent 70%)`,
        }}
      />
      {[
        [62, 26],
        [70, 46],
        [54, 54],
        [78, 30],
      ].map(([x, y], i) => (
        <span
          key={i}
          className="absolute size-[40px]"
          style={{
            // Snap to the 40px grid so the squares sit in cells.
            left: `round(down, ${x}%, 40px)`,
            top: `round(down, ${y}%, 40px)`,
            background:
              i % 2
                ? a("var(--highlight-fill)", tone === "deep" ? 45 : 22)
                : a("var(--brand)", tone === "deep" ? 50 : 20),
          }}
        />
      ))}
    </>
  );
}

function Dots({ tone }: ArtProps) {
  const dot = tone === "deep" ? "color-mix(in oklab, white 22%, transparent)" : a("var(--brand)", 28);
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${dot} 1.6px, transparent 1.8px)`,
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(135deg, black 20%, transparent 75%)",
        }}
      />
      <span
        className="absolute -top-[12%] -right-[8%] aspect-square w-[46%] rounded-full"
        style={{ background: a("var(--highlight-fill)", tone === "deep" ? 70 : 55) }}
      />
      <span
        className="absolute -bottom-[16%] left-[8%] aspect-square w-[38%] rounded-full"
        style={{ background: a("var(--brand)", tone === "deep" ? 75 : 45) }}
      />
      <span
        className="absolute top-[38%] left-[46%] aspect-square w-[14%] rounded-full"
        style={{ background: a("var(--highlight-fill)", tone === "deep" ? 60 : 35) }}
      />
    </>
  );
}

function Rays({ tone }: ArtProps) {
  const ray = tone === "deep" ? 26 : 18;
  return (
    <>
      <div
        className="absolute -inset-[30%]"
        style={{
          background: `repeating-conic-gradient(from 200deg at 85% 15%, ${a("var(--brand)", ray)} 0deg 6deg, transparent 6deg 16deg)`,
          maskImage: "radial-gradient(70% 70% at 80% 20%, black, transparent 75%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, transparent 45%, ${a("var(--highlight-fill)", tone === "deep" ? 45 : 25)} 100%)`,
        }}
      />
    </>
  );
}

/** A faint SVG noise so gradients don't band. */
function Grain() {
  return (
    <svg className="absolute inset-0 size-full opacity-[0.08] mix-blend-overlay">
      <filter id="site-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#site-grain)" />
    </svg>
  );
}

const ART: Record<GeneratedPattern, (props: ArtProps) => React.ReactNode> = {
  aurora: Aurora,
  mesh: Mesh,
  waves: Waves,
  grid: GridArt,
  dots: Dots,
  rays: Rays,
};

export const PATTERN_LABELS: Record<GeneratedPattern, string> = {
  aurora: "Aurora",
  mesh: "Mesh",
  waves: "Waves",
  grid: "Grid",
  dots: "Dots",
  rays: "Rays",
};
