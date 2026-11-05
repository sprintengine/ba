import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThreadField } from "./thread-field";

export function ClosingSection() {
  return (
    <section
      id="start"
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden py-32 text-center sm:py-44"
    >
      <ThreadField className="inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent,black_40%,black_70%,transparent)] opacity-70" />
      <div className="px-6">
        <h2
          id="cta-title"
          className="mx-auto max-w-4xl text-[clamp(2.5rem,5.4vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.048em] text-balance"
        >
          Have your booking page live this afternoon.
        </h2>
        <div className="mt-10 flex justify-center gap-2.5 max-sm:flex-col max-sm:items-center max-sm:[&>a]:w-full max-sm:[&>a]:max-w-[17rem]">
          <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/sign-up">
              Start for free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
        <p className="mt-5 text-[0.9375rem] text-muted-foreground">
          Free for up to 100 bookings a month, no card needed. We never take a cut of your payments.
        </p>
      </div>
    </section>
  );
}
