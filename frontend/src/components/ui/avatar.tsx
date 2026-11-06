"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn, initials } from "@/lib/utils";

const sizes = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-lg",
} as const;

// Soft, warm-leaning tints for businesses; deterministic per name. People are neutral: colour on a list of customers
// would say nothing, and colour is kept for the staff and services it means something for.
const tints = [
  "bg-[oklch(0.93_0.04_180)] text-[oklch(0.4_0.07_185)] dark:bg-[oklch(0.33_0.05_185)] dark:text-[oklch(0.88_0.06_180)]",
  "bg-[oklch(0.93_0.04_250)] text-[oklch(0.42_0.1_255)] dark:bg-[oklch(0.33_0.06_255)] dark:text-[oklch(0.88_0.05_250)]",
  "bg-[oklch(0.94_0.045_60)] text-[oklch(0.45_0.1_50)] dark:bg-[oklch(0.35_0.06_55)] dark:text-[oklch(0.9_0.06_65)]",
  "bg-[oklch(0.93_0.04_330)] text-[oklch(0.45_0.12_340)] dark:bg-[oklch(0.34_0.06_340)] dark:text-[oklch(0.9_0.05_330)]",
  "bg-[oklch(0.93_0.04_290)] text-[oklch(0.43_0.12_290)] dark:bg-[oklch(0.33_0.06_290)] dark:text-[oklch(0.9_0.05_290)]",
  "bg-[oklch(0.94_0.045_140)] text-[oklch(0.42_0.09_145)] dark:bg-[oklch(0.34_0.05_145)] dark:text-[oklch(0.9_0.06_140)]",
];

function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tints[h % tints.length];
}

export type AvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizes;
  /** Square-ish for businesses/resources, round for people. */
  shape?: "circle" | "square";
  className?: string;
  /** Hidden from assistive technology, where what it sits in is named already (a menu button). */
  "aria-hidden"?: boolean;
};

export function Avatar({
  name,
  src,
  size = "md",
  shape = "circle",
  className,
  "aria-hidden": hidden,
}: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      aria-hidden={hidden}
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden font-semibold select-none",
        shape === "circle" ? "rounded-full" : "rounded-[28%]",
        sizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name ?? ""} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 400 : 0}
        className={cn(
          "flex size-full items-center justify-center",
          shape === "circle" ? "bg-muted text-muted-foreground" : tintFor(name ?? "?"),
        )}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/** Overlapping avatars with a "+N" overflow. */
export function AvatarGroup({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name?: string | null; src?: string | null }[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} src={p.src} size={size} className="ring-2 ring-surface" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-surface",
            sizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
