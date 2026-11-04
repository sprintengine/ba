import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "./section";

/** Closing call to action used at the bottom of marketing pages. */
export function CtaBand({
  title = "Get your booking page set up today.",
  description = "Free to start, no card required. 0% platform fee on payments, always.",
  primary = { href: "/sign-up", label: "Start for free" },
  secondary = { href: "/pricing", label: "See pricing" },
}: {
  title?: string;
  description?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <section className="pt-4 pb-20 sm:pb-28" aria-labelledby="cta-title">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface px-6 py-16 text-center shadow-sm sm:px-12 sm:py-24">
          <div
            aria-hidden
            className="absolute bottom-[-14rem] left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-iris-300),transparent_60%)] opacity-50 blur-3xl dark:opacity-20"
          />
          <h2
            id="cta-title"
            className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-display-sm"
          >
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">{description}</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="brand" size="lg">
              <Link href={primary.href}>
                {primary.label} <ArrowRight />
              </Link>
            </Button>
            {secondary && (
              <Button asChild variant="secondary" size="lg">
                <Link href={secondary.href}>{secondary.label}</Link>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
