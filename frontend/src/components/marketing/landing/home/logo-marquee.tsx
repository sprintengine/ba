"use client";

import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { PAYMENT_LOGOS, type PaymentLogo } from "./payment-logos";
import s from "./logo-marquee.module.css";

function Logo({ logo }: { logo: PaymentLogo }) {
  const [, , w = 1, h = 1] = logo.viewBox.split(" ").map(Number);
  return (
    <li className="flex shrink-0 items-center gap-2.5 text-foreground/80">
      <svg
        viewBox={logo.viewBox}
        style={{ height: `${logo.height}rem`, width: `${(logo.height * w) / h}rem` }}
        fill="currentColor"
        role="img"
        aria-label={logo.name}
      >
        <path d={logo.path} />
      </svg>
      {!logo.wordmark && (
        <span aria-hidden className="text-[1.3125rem] font-semibold tracking-[-0.02em]">
          {logo.name}
        </span>
      )}
    </li>
  );
}

/**
 * The payment brands, drifting across the page; hover stops them. The second run of the same logos is what makes the
 * loop seamless, so it is hidden from assistive tech. With reduced motion it is one still row.
 */
export function LogoMarquee({ className }: { className?: string }) {
  const mounted = useMounted();
  const still = useReducedMotion() && mounted;
  return (
    <div className={cn(s.marquee, still && s.still, className)}>
      <div className={s.track}>
        <ul aria-label="Payment providers" className={s.run}>
          {PAYMENT_LOGOS.map((l) => (
            <Logo key={l.name} logo={l} />
          ))}
        </ul>
        {!still && (
          <ul aria-hidden className={s.run}>
            {PAYMENT_LOGOS.map((l) => (
              <Logo key={l.name} logo={l} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
