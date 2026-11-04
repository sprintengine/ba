import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** Social card size shared by every marketing `opengraph-image`. */
export const OG_SIZE = { width: 1200, height: 630 };

// Static Figtree instances at 450 and 640 (registered as 400 and 600: the satori renderer behind ImageResponse
// reads neither variable fonts nor in-between weights).
const FONTS = join(process.cwd(), "src/components/marketing/fonts");

// Fixed brand values (ImageResponse can't read CSS variables). Prism: graphite ink, iris accent, prism light.
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="tile" x1="0.25" y1="0" x2="0.6" y2="1">
                <stop offset="0" stopColor="#454952" />
                <stop offset="0.55" stopColor="#1c1e22" />
                <stop offset="1" stopColor="#0b0c0e" />
              </linearGradient>
              <linearGradient id="lit" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#8fd8f2" />
                <stop offset="0.5" stopColor="#b9a6ff" />
                <stop offset="1" stopColor="#ffb995" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9.5" fill="url(#tile)" />
            <rect x="6" y="7" width="20" height="6" rx="3" fill="#fff" fillOpacity="0.22" />
            <rect x="6" y="17" width="20" height="8" rx="4" fill="url(#lit)" />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em" }}>
            bookanything
          </div>
        </div>
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
