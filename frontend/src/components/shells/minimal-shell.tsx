import Link from "next/link";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

/**
 * Focused chrome for flows outside the dashboard: onboarding, My bookings,
 * post-sign-in routing, dev checkout. Logo left, `actions` right.
 */
export function MinimalShell({
  children,
  actions,
  width = "default",
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  width?: "narrow" | "default" | "wide";
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Link
            href="/"
            aria-label="bookanything home"
            className="flex min-h-11 items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>
      <main
        id="main"
        className={cn(
          // 16px text fields on touch screens at every width (iPadOS zooms into smaller ones).
          "mx-auto w-full flex-1 px-5 py-10 sm:px-8 pointer-coarse:[&_input]:text-base pointer-coarse:[&_textarea]:text-base",
          width === "narrow" && "max-w-xl",
          width === "default" && "max-w-4xl",
          width === "wide" && "max-w-6xl",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
