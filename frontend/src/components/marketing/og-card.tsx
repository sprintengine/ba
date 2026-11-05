import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PRISM, WEAVE_GAP, WEIGHT, WORD } from "@/components/brand/logo";

/** Social card size shared by every marketing `opengraph-image`. */
export const OG_SIZE = { width: 1200, height: 630 };

// Static Figtree instances at 450 and 640 (registered as 400 and 600: the satori renderer behind ImageResponse
// reads neither variable fonts nor in-between weights).
const FONTS = join(process.cwd(), "src/components/marketing/fonts");

// Fixed brand values (ImageResponse can't read CSS variables). Prism: graphite ink, iris accent, prism light.
/** The logo's rings, written out: the renderer behind ImageResponse takes only plain elements inside an svg. */
const RING_SIDES = [
  ["left", WORD.rings.left, WORD.rings.cutLeft],
  ["right", WORD.rings.right, WORD.rings.cutRight],
] as const;

const INK = "#0f1012";
const MUTED = "#50565f";
const IRIS = "#5b4ae0";
const STUDIO = "radial-gradient(120% 80% at 50% 0%, #fbfbfc 0%, #f1f2f5 55%, #e6e8ec 100%)";
const LINE = "#e2e4e8";

/**
 * Renders the marketing social card: logo, eyebrow, big headline (with an
 * optional accent-coloured word), a subtitle and a row of chips.
 */
export async function renderOgCard({
  eyebrow,
  title,
  highlight,
  subtitle,
  chips,
  accent = IRIS,
}: {
  eyebrow?: string;
  /** Headline; `{highlight}` inside it is rendered in the accent colour. */
  title: string;
  highlight?: string;
  subtitle: string;
  chips: string[];
  accent?: string;
}) {
  const [semibold, regular] = await Promise.all([
    readFile(join(FONTS, "Figtree-SemiBold.ttf")),
    readFile(join(FONTS, "Figtree-Regular.ttf")),
  ]);
  const [before, after] = highlight ? title.split(`{${highlight}}`) : [title, undefined];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: STUDIO,
        fontFamily: "Figtree",
        color: INK,
        position: "relative",
      }}
    >
      {/* Prism light: a soft band of the spectrum across the card. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: -200,
          right: -200,
          top: 330,
          height: 220,
          transform: "rotate(-8deg)",
          opacity: 0.55,
          background:
            "radial-gradient(40% 50% at 22% 50%, #8fd8f2 0%, rgba(143,216,242,0) 100%), radial-gradient(40% 50% at 52% 50%, #bfaeff 0%, rgba(191,174,255,0) 100%), radial-gradient(40% 50% at 80% 50%, #ffbf9c 0%, rgba(255,191,156,0) 100%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <svg
          width={(WORD.width * 64) / WORD.height}
          height={64}
          viewBox={`0 0 ${WORD.width} ${WORD.height}`}
          aria-label="bookanything"
        >
          <defs>
            <linearGradient
              id="line"
              gradientUnits="userSpaceOnUse"
              x1={WORD.ringsLeft}
              x2={WORD.ringsRight}
              y1={0}
              y2={0}
            >
              {PRISM.map((color, i) => (
                <stop key={color} offset={i / (PRISM.length - 1)} stopColor={color} />
              ))}
            </linearGradient>
            {RING_SIDES.map(([side, , cut]) => (
              <mask
                key={side}
                id={side}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={WORD.width}
                height={WORD.height}
              >
                <rect width={WORD.width} height={WORD.height} fill="#fff" />
                <path d={cut} fill="none" stroke="#000" strokeWidth={WEIGHT.display + 2 * WEAVE_GAP} />
              </mask>
            ))}
          </defs>
          <path d={WORD.letters} fill={INK} />
          {RING_SIDES.map(([side, ring]) => (
            <path
              key={side}
              d={ring}
              fill="none"
              stroke="url(#line)"
              strokeWidth={WEIGHT.display}
              mask={`url(#${side})`}
            />
          ))}
          <circle cx={WORD.dot.cx} cy={WORD.dot.cy} r={WORD.dot.r} fill={PRISM[1]} />
        </svg>
        {eyebrow && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 26,
              color: accent,
              fontWeight: 600,
            }}
          >
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, background: accent }} />
            {eyebrow}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 80,
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: "-0.045em",
            maxWidth: 1000,
          }}
        >
          {before}
          {highlight && (
            <>
              &nbsp;<span style={{ color: accent }}>{highlight}</span>&nbsp;
            </>
          )}
          {after}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{subtitle}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {chips.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                border: `1px solid ${LINE}`,
                background: "rgba(255,255,255,0.7)",
                fontSize: 22,
                color: INK,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: MUTED }}>bookanything.ie</div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Figtree", data: semibold, style: "normal", weight: 600 },
        { name: "Figtree", data: regular, style: "normal", weight: 400 },
      ],
    },
  );
}
