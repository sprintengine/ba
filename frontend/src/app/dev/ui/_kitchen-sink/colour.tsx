"use client";

import { cn } from "@/lib/utils";
import { Section } from "./section";

const SWATCHES: { name: string; cls: string }[] = [
  { name: "background", cls: "bg-background" },
  { name: "surface", cls: "bg-surface" },
  { name: "surface-sunken", cls: "bg-surface-sunken" },
  { name: "muted", cls: "bg-muted" },
  { name: "border", cls: "bg-border" },
  { name: "border-strong", cls: "bg-border-strong" },
  { name: "muted-foreground", cls: "bg-muted-foreground" },
  { name: "foreground", cls: "bg-foreground" },
  { name: "primary", cls: "bg-primary" },
  { name: "brand", cls: "bg-brand" },
  { name: "brand-soft", cls: "bg-brand-soft" },
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "info", cls: "bg-info" },
];

const IRIS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

const GRAY = [
  "0",
  "25",
  "50",
  "100",
  "150",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "850",
  "900",
  "925",
  "950",
  "975",
];

export function ColourSection() {
  return (
    <Section
      id="colour"
      title="Colour"
      description="Semantic tokens (use these), plus the raw graphite and iris ramps, and the decorative prism spectrum."
    >
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {SWATCHES.map((s) => (
          <div key={s.name} className="flex flex-col gap-1.5">
            <div className={cn("h-12 rounded-lg shadow-[inset_0_0_0_1px_var(--border)]", s.cls)} />
            <span className="truncate font-mono text-2xs text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <div className="flex overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border)]">
          {GRAY.map((g) => (
            <div
              key={g}
              className="h-9 flex-1"
              style={{ background: `var(--color-gray-${g})` }}
              title={`gray-${g}`}
            />
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg">
          {IRIS.map((g) => (
            <div
              key={g}
              className="h-9 flex-1"
              style={{ background: `var(--color-iris-${g})` }}
              title={`iris-${g}`}
            />
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div
              key={n}
              className="h-9 flex-1"
              style={{ background: `var(--chart-${n})` }}
              title={`chart-${n}`}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
