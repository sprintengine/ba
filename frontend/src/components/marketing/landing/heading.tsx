import { PRISM } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** A headline's full stop, as the logo's: lit in the prism. Only for the page's few biggest headlines. */
export function PrismDot() {
  return (
    <>
      <span
        aria-hidden
        className="ml-[0.05em] inline-block size-[0.17em] rounded-full"
        style={{ background: `linear-gradient(90deg, ${PRISM.join(", ")})` }}
      />
      <span className="sr-only">.</span>
    </>
  );
}

/** A quiet line of the same prism between sections: the thread the bookings fly along. */
export function PrismThread({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("mx-auto h-px w-full max-w-[46rem] opacity-60", className)}
      style={{ background: `linear-gradient(90deg, transparent, ${PRISM.join(", ")}, transparent)` }}
    />
  );
}

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
  dot = false,
  punch = false,
  className,
}: {
  id?: string;
  label: React.ReactNode;
  title: React.ReactNode;
  /** The muted second clause of the headline. */
  lit?: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  /** End the headline on the logo's lit dot, not a full stop. */
  dot?: boolean;
  /** The second clause is the point of the headline: full strength, not muted. */
  punch?: boolean;
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
        {lit && (
          <span className="block">
            <span className={cn(!punch && "text-prism")}>{lit}</span>
            {dot && <PrismDot />}
          </span>
        )}
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
