import Link from "next/link";
import { CalendarCheck2, CreditCard, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const POINTS = [
  {
    icon: Sparkles,
    title: "Set up from a description",
    body: "Tell us about your business and AI drafts your services, hours and booking page for you to check.",
  },
  {
    icon: CalendarCheck2,
    title: "No double bookings",
    body: "Each booking holds the person, room and equipment it needs, so two clients never get the same slot.",
  },
  {
    icon: CreditCard,
    title: "0% platform fee",
    body: "Payments and deposits go straight to your own Stripe account. We don't take a cut.",
  },
];

/** Split-screen chrome for /sign-in and /sign-up. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link
          href="/"
          aria-label="bookanything home"
          className="flex min-h-11 w-fit items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise">{children}</div>
        </div>
        <p className="text-xs text-subtle-foreground">
          By continuing you agree to our{" "}
          <Link
            href="/legal/terms"
            className="focus-ring rounded-sm underline underline-offset-2 hover:text-foreground"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy"
            className="focus-ring rounded-sm underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface-sunken lg:flex">
        <div
          aria-hidden
          className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-[radial-gradient(circle,var(--color-iris-300)_0%,transparent_65%)] opacity-40 blur-3xl dark:opacity-20"
        />
        <div className="relative flex flex-1 flex-col justify-center gap-10 p-12 xl:p-16">
          <div className="flex max-w-md flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Let clients book and pay online without ringing you.
            </h2>
            <p className="text-muted-foreground">
              For physios, car washes, music teachers, clinics and anyone else who works by appointment. Your
              calendar, clients and payments are all in one place.
            </p>
          </div>
          <ul className="grid max-w-md gap-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-brand shadow-xs">
                  <Icon className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
