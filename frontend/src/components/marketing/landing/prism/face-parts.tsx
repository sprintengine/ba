import { cn } from "@/lib/utils";
import { DESK_FACES, PHONE_FACES } from "./choreography";
import s from "./prism.module.css";

/** A face's design sizes as CSS variables: --fw/--fh/--fr on desktops, --pw/--ph/--pr on phones. */
export function faceVars(index: number): React.CSSProperties {
  const d = DESK_FACES[index]!;
  const p = PHONE_FACES[index]!;
  return {
    "--fw": `${d.w}px`,
    "--fh": `${d.h}px`,
    "--fr": `${d.r}px`,
    "--pw": `${p.w}px`,
    "--ph": `${p.h}px`,
    "--pr": `${p.r}px`,
  } as React.CSSProperties;
}

/** One face, sized from the choreography tables (desktop and phone). */
export function FaceSlot({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-face={index} className={cn(s.st, className)} style={faceVars(index)}>
      {children}
    </div>
  );
}

/** A translucent chip printed on the glass. */
export function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-(--prism-chip-border) bg-(--prism-chip) shadow-(--prism-chip-shadow)",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Pill({
  ok,
  className,
  children,
}: {
  ok?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-[7px] bg-(--prism-chip) px-2 text-[11.5px] font-semibold whitespace-nowrap text-muted-foreground shadow-(--prism-ring) [&_svg]:size-[1em]",
        ok && "text-success-soft-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Initials or an icon on a small rounded tile. `light` = a pale tile instead of ink. */
export function Tile({
  light,
  className,
  children,
}: {
  light?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-[9px] text-[11px] font-semibold tracking-normal [&_svg]:size-[13px]",
        light
          ? "bg-(--prism-chip) text-foreground shadow-(--prism-ring)"
          : "bg-primary text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Live({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--success-soft)]" />
      {children}
    </span>
  );
}

/** The assistant, as the faces draw it: a dark pebble with two eyes. */
export function BoPebble({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block size-[34px] shrink-0 rounded-[54%_46%_50%_50%/52%_52%_48%_48%] bg-primary shadow-md",
        "before:absolute before:top-[35%] before:left-[47%] before:h-[24%] before:w-[13%] before:rounded-full before:bg-primary-foreground",
        "after:absolute after:top-[35%] after:left-[70%] after:h-[24%] after:w-[13%] after:rounded-full after:bg-primary-foreground",
        className,
      )}
    />
  );
}

/** The prism spectrum as a thin bar of light (now-lines, lit slots). */
export const LIGHT_LINE = "bg-linear-to-r from-prism-cyan via-prism-lilac to-prism-peach";
