import { Banknote, CreditCard, PiggyBank, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../reveal";
import { PrismContainer } from "./heading";
import prism from "./prism/prism.module.css";

const MODES = [
  { icon: CreditCard, title: "Pay in full", body: "Paid when they book. This is the default." },
  { icon: PiggyBank, title: "Deposit", body: "Part online, the rest when they arrive." },
  { icon: Banknote, title: "Pay on the day", body: "Book online, pay in person. No card needed." },
];

const POLICY = [
  { when: "Customer cancels in good time", what: "Full refund, automatically", tone: "success" },
  { when: "Customer cancels late", what: "Your call: none, half or full", tone: "neutral" },
  { when: "You cancel", what: "Always a full refund", tone: "success" },
  { when: "Paid after the slot was taken", what: "Refunded, with an apology email", tone: "success" },
] as const;

export function PaymentsSection() {
  return (
    <section id="payments" aria-labelledby="payments-title" className="scroll-mt-24 pb-24 sm:pb-32">
      <PrismContainer className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-4">
        {/* The promise */}
        <div
          className={cn(
            prism.tile,
            "relative flex flex-col justify-between overflow-hidden rounded-[28px] p-7 max-sm:rounded-3xl sm:p-10",
          )}
        >
          <div aria-hidden className={cn(prism.glow, "top-[78%] left-[30%] h-[45%] w-[110%]")} />
          <div className="relative">
            <p className="mb-3 text-[0.9375rem] font-semibold text-muted-foreground">Payments</p>
            <h2
              id="payments-title"
              className="text-[clamp(1.875rem,3.2vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance"
            >
              We don’t take a cut <span className="text-prism">of your bookings.</span>
            </h2>
            <p className="mt-4 max-w-md text-base leading-[1.6] text-muted-foreground">
              Clients pay through Stripe, into your own Stripe account. You&apos;re the merchant of record and
              the money is yours from the moment it&apos;s paid. We charge a flat monthly fee instead.
            </p>
          </div>
          <div className="relative mt-12">
            <p className="tnum text-[5.5rem] leading-none font-semibold tracking-[-0.06em] sm:text-[8rem]">
              0<span className="text-prism">%</span>
            </p>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Our fee on your bookings. Stripe&apos;s standard card fees still apply, as they would anywhere.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {/* Payment modes */}
          <Reveal className={cn(prism.tile, "rounded-[28px] p-6 max-sm:rounded-3xl sm:p-8")}>
            <h3 className="text-lg font-semibold tracking-[-0.02em]">Choose how each service is paid</h3>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {MODES.map(({ icon: Icon, title, body }, i) => (
                <div
                  key={title}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-4",
                    i === 0
                      ? "border-foreground bg-surface shadow-[0_0_0_1px_var(--foreground)]"
                      : "border-border bg-surface-sunken/40",
                  )}
                >
                  <Icon className={cn("size-4.5", i === 0 ? "text-foreground" : "text-subtle-foreground")} />
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Refund policy */}
          <Reveal delay={0.08} className={cn(prism.tile, "rounded-[28px] p-6 max-sm:rounded-3xl sm:p-8")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">Refunds that follow your policy</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set your notice period once and cancellations are refunded for you.
                </p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <RotateCcw className="size-4" />
              </span>
            </div>
            <dl className="mt-5 divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {POLICY.map((row) => (
                <div
                  key={row.when}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <dt className="flex-1 text-sm text-muted-foreground">{row.when}</dt>
                  <dd
                    className={cn(
                      "text-sm font-medium",
                      row.tone === "success" ? "text-success-soft-foreground" : "text-foreground",
                    )}
                  >
                    {row.what}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </PrismContainer>
    </section>
  );
}
