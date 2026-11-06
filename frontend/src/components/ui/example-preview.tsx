import { cn } from "@/lib/utils";

/**
 * What a screen will look like once it's in use: real components with sample content, dimmed and marked "Example", so
 * an empty page shows the thing rather than describing it. It can't be used or reached, and it's hidden from screen
 * readers: the empty state beside it says the same in words.
 */
export function ExamplePreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden inert className={cn("relative select-none", className)}>
      <span className="absolute -top-2.5 left-3 z-10 rounded-full border border-border bg-surface px-2 py-0.5 text-2xs font-medium text-muted-foreground">
        Example
      </span>
      <div className="pointer-events-none [mask-image:linear-gradient(to_bottom,black_55%,transparent)] opacity-55">
        {children}
      </div>
    </div>
  );
}
