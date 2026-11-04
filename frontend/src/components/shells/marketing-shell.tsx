import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { INDUSTRIES } from "./industries";
import { MarketingNav } from "./marketing-nav";

const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/help/ai-assistant", label: "Use with AI assistants" },
      { href: "/sign-up", label: "Get started" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  { title: "Industries", links: INDUSTRIES.map((i) => ({ href: `/for/${i.slug}`, label: i.short })) },
  {
    title: "Company",
    links: [
      { href: "mailto:hello@bookanything.ie", label: "Contact" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
    ],
  },
];

/**
 * Public marketing chrome (Prism): a floating glass pill nav the page scrolls under, and a quiet footer.
 * `main` leaves room for the pill; the landing page pulls itself back up under it.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingNav />
      <main id="main" className="flex-1 pt-20 max-[760px]:pt-[4.5rem]">
        {children}
      </main>
      <footer className="relative z-10 bg-background">
        {/* The landing's container (PrismContainer): its content lines up with the nav pill's edges. */}
        <div className="mx-auto w-full max-w-[74rem] px-4 sm:px-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-border py-14 sm:grid-cols-3 md:grid-cols-[1.5fr_repeat(3,1fr)]">
            <div className="col-span-2 flex flex-col gap-4 sm:col-span-3 md:col-span-1">
              <Link
                href="/"
                aria-label="bookanything home"
                className="focus-ring inline-flex min-h-11 w-fit items-center rounded-md"
              >
                <Logo />
              </Link>
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                Online booking for physios, car washes, music teachers, clinics and anyone else who works by
                appointment. 0% platform fee on payments.
              </p>
            </div>
            {FOOTER.map((col) => (
              <div key={col.title} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold text-subtle-foreground">{col.title}</h2>
                <ul className="flex flex-col">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="focus-ring inline-flex min-h-9 min-w-10 items-center rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-start justify-between gap-4 border-t border-border-subtle py-6 text-[0.8125rem] text-subtle-foreground sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} bookanything · Made in Ireland</p>
            <ThemeToggle className="pointer-coarse:[&_button]:size-11" />
          </div>
        </div>
      </footer>
    </div>
  );
}
