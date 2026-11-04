import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import s from "./prism.module.css";

export function HeroCopy({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={s.heroCopy}>
      <div className="min-w-0">
        <h1 className="text-[clamp(2.75rem,5.4vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance max-[760px]:text-[clamp(2.25rem,10.5vw,2.625rem)] short-landscape:text-[2.25rem]">
          <span className="mb-3.5 flex items-center gap-2.5 text-[0.9375rem] leading-normal font-semibold tracking-[-0.01em] text-muted-foreground max-[760px]:mb-2.5 max-[760px]:text-[0.84375rem] short-landscape:mb-2">
            <span className={s.dot} />
            Online booking for appointment businesses
          </span>
          Let your clients <span className="text-prism">book themselves in.</span>
        </h1>
      </div>
      <div className="max-w-[24rem] shrink-0 pb-1.5 max-lg:max-w-[34rem]">
        <p className="text-[1.0625rem] leading-normal text-muted-foreground max-[760px]:text-[0.96875rem] [@media(max-height:419.98px)]:hidden">
          Clients pick a time, pay and get a reminder before they come. You see it all in one calendar for
          your staff, rooms and equipment, and we never take a cut of what they pay.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5 short-landscape:mt-3.5 short-landscape:flex-nowrap max-[760px]:[&>a]:grow short-landscape:[&>a]:h-11 short-landscape:[&>a]:px-4">
          <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/sign-up">
              Start for free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
            <a href="#demo">See it work</a>
          </Button>
        </div>
        <p className="mt-3 text-[0.8125rem] text-subtle-foreground short-landscape:hidden">
          Free for up to 100 bookings a month. No card needed.
        </p>
      </div>
    </div>
  );
}

export function ClosingCta({
  ref,
  anchor,
  className,
}: {
  ref: React.Ref<HTMLElement>;
  anchor: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <section
      ref={ref}
      id="start"
      aria-labelledby="cta-title"
      // A column, not fixed offsets: a longer headline (a narrow phone, 200% text) pushes the slab and the buttons
      // down instead of running into them.
      className={cn(
        s.cta,
        "flex flex-col items-center pt-[110px] pb-[100px] text-center max-[760px]:pt-[88px] max-[760px]:pb-[72px]",
        className,
      )}
    >
      <div className="w-full px-6">
        <p className="mb-3.5 text-[0.9375rem] font-semibold text-muted-foreground">Get started</p>
        <h2
          id="cta-title"
          className="mx-auto max-w-4xl text-[clamp(2.5rem,5.4vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.048em] text-balance"
        >
          Have your booking page <span className="text-prism">live this afternoon.</span>
        </h2>
      </div>
      <div
        ref={anchor}
        aria-hidden
        className="mt-5 h-[340px] w-[560px] max-w-[calc(100%-32px)] shrink-0 max-[760px]:h-[320px]"
      />
      <div className="mt-[90px] w-full px-6 max-[760px]:mt-[60px]">
        <div className="flex justify-center gap-2.5 max-[760px]:flex-col max-[760px]:items-center max-[760px]:[&>a]:w-full max-[760px]:[&>a]:max-w-[17rem]">
          <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/sign-up">
              Start for free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
        <p className="mt-5 text-[0.96875rem] text-muted-foreground">
          Free for up to 100 bookings a month, no card needed. We never take a cut of your payments.
        </p>
      </div>
    </section>
  );
}
