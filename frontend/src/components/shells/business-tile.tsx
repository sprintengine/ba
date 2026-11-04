import { normalizeHex, readableForeground } from "@/lib/theme/color";
import { cn, initials } from "@/lib/utils";

/** Square business avatar: logo if set, else initials on the business colour. */
export function BusinessTile({
  name,
  logoUrl,
  color,
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const bg = normalizeHex(color) ?? "#0e7c70";
  const dims = {
    sm: "size-5 text-[0.5625rem] rounded-[5px]",
    md: "size-7 text-xs rounded-md",
    lg: "size-10 text-sm rounded-lg",
    xl: "size-14 text-lg rounded-xl",
  }[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied logo URLs
      <img
        src={logoUrl}
        alt=""
        className={cn(
          "shrink-0 bg-surface object-cover shadow-[inset_0_0_0_1px_var(--border)]",
          dims,
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)]",
        dims,
        className,
      )}
      style={{ backgroundColor: bg, color: readableForeground(bg) }}
    >
      {initials(name).slice(0, 2)}
    </span>
  );
}
