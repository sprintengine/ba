import { cn } from "@/lib/utils";

/**
 * A Prism section heading: a quiet label, a display headline that may end in a lit clause (`text-prism`, the rest
 * of the same sentence), and an optional lead. Centred by default (left on phones); `align="left"` for split layouts.
 */
export function PrismHeading({
  id,
  label,
  title,
  lit,
  lead,
  align = "center",
  className,
}: {
  id?: string;
  label: React.ReactNode;
  title: React.ReactNode;
  /** The muted second clause of the headline. */
  lit?: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        // Centred from sm up; on a phone every section reads from the left edge, like the story beats around them.
        align === "center" ? "mx-auto max-w-4xl sm:items-center sm:text-center" : "max-w-2xl",
        className,
      )}
    >
      <p className="mb-3.5 flex items-center gap-2 text-[0.9375rem] font-semibold text-muted-foreground [&_svg]:size-4">
        {label}
      </p>
      <h2
        id={id}
        className={cn(
          "font-semibold text-balance",
          align === "center"
            ? "text-[clamp(2.25rem,4.4vw,4rem)] tracking-[-0.045em]"
            : "text-[clamp(2rem,3.3vw,3.125rem)] tracking-[-0.04em]",
          // After the size: tailwind-merge drops a line height that comes before a font size.
          "leading-[1.02]",
        )}
      >
        {title}
        {lit && <span className="block text-prism">{lit}</span>}
      </h2>
      {lead && (
        <p className="mt-5 max-w-[36rem] text-base leading-[1.6] text-muted-foreground sm:text-lg">{lead}</p>
      )}
    </div>
  );
}

/** Page-width wrapper for Prism sections (a touch wider than the default container). */
export function PrismContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[74rem] px-4 sm:px-8", className)} {...props} />;
}
