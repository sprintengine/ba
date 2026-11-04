"use client";

import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { MOOD_LABEL, type BoMood } from "@/lib/assistant/mood";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** A squishy blob: a little wider than tall, a flatter base, and not quite symmetrical. */
const BODY =
  "M40.5 71C22.4 71.4 8.6 64.6 8.6 47.2 8.6 28.4 21.6 13.8 39.6 13.8c19 0 31.8 13.6 31.8 31.6 0 17.8-12.4 25.2-30.9 25.6Z";

/** Where the eyes sit when Bo glances up and to the side (left eye a touch nearer, so a touch bigger). */
const EYE_AT = [
  { x: 42.6, y: 33, scale: 1.06 },
  { x: 56.2, y: 30.4, scale: 1 },
] as const;

type Pill = { kind: "pill"; w: number; h: number; tilt: readonly [number, number] };
type Arc = { kind: "arc"; tilt: readonly [number, number] };

/** Per mood: where the eyes look (offset from the glance) and their shape. The eyes carry all the expression. */
const FACE: Record<BoMood, { look: { x: number; y: number }; eye: Pill | Arc }> = {
  idle: { look: { x: 0, y: 0 }, eye: { kind: "pill", w: 5.4, h: 12.6, tilt: [-20, -20] } },
  listening: { look: { x: -9.5, y: 7.5 }, eye: { kind: "pill", w: 5.6, h: 14.2, tilt: [-6, -6] } },
  thinking: { look: { x: -1.4, y: -4.2 }, eye: { kind: "pill", w: 5.4, h: 12, tilt: [-26, -26] } },
  success: { look: { x: -3.6, y: 0.4 }, eye: { kind: "arc", tilt: [-6, -6] } },
  error: { look: { x: -6.2, y: 6.4 }, eye: { kind: "pill", w: 7.6, h: 3.8, tilt: [-18, 18] } },
  attention: { look: { x: -4.6, y: -0.6 }, eye: { kind: "pill", w: 7.8, h: 11.6, tilt: [-10, -10] } },
};

/**
 * Bo: a soft, monochrome blob (ink on light surfaces, chalk on dark) with two capsule eyes that do all the talking.
 * Mood changes the eyes; the motion (blink, breathe, wobble, hop, shake, nudge) lives in globals.css and stops for
 * reduced motion. Decorative by default; pass `labelled` where the character itself must be announced.
 */
export function BoCharacter({
  mood = "idle",
  size = 48,
  labelled = false,
  className,
}: {
  mood?: BoMood;
  size?: number;
  labelled?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { look, eye } = FACE[mood];
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={cn("bo shrink-0 overflow-visible", className)}
      data-mood={mood}
      data-motion={reduced ? "reduced" : "full"}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? `${ASSISTANT_NAME}, ${MOOD_LABEL[mood]}` : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <ellipse className="bo-shadow" cx="40" cy="72.4" rx="22" ry="2.4" fill="var(--bo-shadow)" />

      <g className="bo-body">
        <path d={BODY} fill="var(--bo-fill)" />
        <g className="bo-look" style={{ transform: `translate(${look.x}px, ${look.y}px)` }}>
          <g className={eye.kind === "pill" ? "bo-eyes" : "bo-eyes-happy"} fill="var(--bo-eye)">
            {EYE_AT.map((at, i) => (
              <g key={i} transform={`translate(${at.x} ${at.y}) rotate(${eye.tilt[i]}) scale(${at.scale})`}>
                {eye.kind === "pill" ? (
                  <rect
                    className="bo-eye"
                    x={-eye.w / 2}
                    y={-eye.h / 2}
                    width={eye.w}
                    height={eye.h}
                    rx={Math.min(eye.w, eye.h) / 2}
                  />
                ) : (
                  <path
                    d="M-3.9 2.5Q0-5.4 3.9 2.5"
                    fill="none"
                    stroke="var(--bo-eye)"
                    strokeWidth="3.3"
                    strokeLinecap="round"
                  />
                )}
              </g>
            ))}
          </g>
        </g>
      </g>

      {/* Thought dots */}
      {mood === "thinking" && (
        <g fill="var(--bo-fill)">
          <circle className="bo-dot" cx="67.5" cy="15.5" r="1.8" />
          <circle className="bo-dot" cx="72.6" cy="9.6" r="2.3" />
          <circle className="bo-dot" cx="78.2" cy="3.4" r="2.8" />
        </g>
      )}
    </svg>
  );
}
