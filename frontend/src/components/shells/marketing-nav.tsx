"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { useSignedInHint } from "@/lib/auth/signed-in-hint";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { INDUSTRIES } from "./industries";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/#industries", label: "Industries" },
  { href: "/pricing", label: "Pricing" },
];

/** The floating pill: glass that the page scrolls under. Desktop shows links; phones and tablets get the menu. */
const PILL =
  "glass-chrome flex h-14 [--glass-chrome-bg:rgb(250_250_250/0.96)] w-full max-w-[70rem] items-center gap-3 rounded-[18px] pr-2 pl-[1.125rem] max-[760px]:h-[3.25rem] max-[760px]:rounded-2xl max-[760px]:pr-1.5 max-[760px]:pl-3.5";

function HomeLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      aria-label="bookanything home"
      onClick={onClick}
      className="focus-ring inline-flex min-h-11 shrink-0 items-center rounded-md"
    >
      <Logo />
    </Link>
  );
}

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // A hint, not the auth provider: marketing pages don't load Clerk (lib/auth/signed-in-hint.ts).
  const signedIn = useSignedInHint();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3.5 z-50 flex justify-center pr-[max(0.875rem,env(safe-area-inset-right))] pl-[max(0.875rem,env(safe-area-inset-left))] before:pointer-events-none before:fixed before:inset-x-0 before:top-0 before:-z-10 before:h-[5.5rem] before:[mask-image:linear-gradient(black_45%,transparent)] before:backdrop-blur-[10px] max-[760px]:top-2.5 max-[760px]:pr-[max(0.625rem,env(safe-area-inset-right))] max-[760px]:pl-[max(0.625rem,env(safe-area-inset-left))]">
      <div className={cn(PILL, "pointer-events-auto")}>
        <HomeLink />
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className="focus-ring inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          {signedIn ? (
            <Button asChild variant="primary" className="h-10 rounded-xl px-4 font-semibold">
              <Link href="/dashboard">
                Dashboard <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className="hidden h-10 rounded-xl px-3.5 text-muted-foreground sm:inline-flex"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="primary" className="h-10 rounded-xl px-4 font-semibold">
                <Link href="/sign-up">Start for free</Link>
              </Button>
            </>
          )}
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              aria-label="Open menu"
              className="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent lg:hidden [&_svg]:size-5"
            >
              <Menu />
            </Dialog.Trigger>
            <MobileMenu signedIn={signedIn} pathname={pathname} close={() => setOpen(false)} />
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}

/** The pill grows into a glass panel: big links, the industries, and the two actions within thumb reach. */
function MobileMenu({
  signedIn,
  pathname,
  close,
}: {
  signedIn: boolean;
  pathname: string;
  close: () => void;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[7px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-x-3.5 top-3.5 z-50 flex max-h-[calc(100dvh-1.75rem)] flex-col overflow-hidden rounded-[22px] border border-(--glass-overlay-border) bg-surface-raised/95 shadow-xl backdrop-blur-2xl backdrop-saturate-150 outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in max-[760px]:inset-x-2.5 max-[760px]:top-2.5 max-[760px]:max-h-[calc(100dvh-1.25rem)] sm:left-auto sm:w-[26rem]"
      >
        <Dialog.Title className="sr-only">Menu</Dialog.Title>
        <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-[1.125rem] max-[760px]:h-[3.25rem] max-[760px]:pr-1.5 max-[760px]:pl-3.5">
          <HomeLink onClick={close} />
          <Dialog.Close
            aria-label="Close menu"
            className="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent [&_svg]:size-5"
          >
            <X />
          </Dialog.Close>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3">
          <nav aria-label="Mobile" className="flex flex-col">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                aria-current={pathname === l.href ? "page" : undefined}
                className="focus-ring flex min-h-13 items-center justify-between rounded-xl px-3 text-[1.375rem] font-semibold tracking-[-0.025em] transition-colors hover:bg-accent aria-[current=page]:bg-accent"
              >
                {l.label}
                <ArrowRight className="size-4 text-subtle-foreground" />
              </Link>
            ))}
          </nav>
          <p className="mt-4 px-3 pb-1.5 text-xs font-semibold text-subtle-foreground">By industry</p>
          <ul className="grid grid-cols-2 gap-1.5">
            {INDUSTRIES.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/for/${i.slug}`}
                  onClick={close}
                  className="focus-ring flex min-h-11 items-center justify-between gap-1 rounded-xl bg-surface/60 px-3 text-sm font-medium shadow-xs ring-1 ring-border-subtle transition-colors hover:bg-surface dark:bg-surface-raised/60"
                >
                  {i.short}
                  <ArrowUpRight className="size-3.5 shrink-0 text-subtle-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-2">
            {signedIn ? (
              <Button asChild variant="primary" size="xl" block className="rounded-[14px] font-semibold">
                <Link href="/dashboard" onClick={close}>
                  Open dashboard
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="primary" size="xl" block className="rounded-[14px] font-semibold">
                  <Link href="/sign-up" onClick={close}>
                    Start for free <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="xl" block className="rounded-[14px] font-semibold">
                  <Link href="/sign-in" onClick={close}>
                    Sign in
                  </Link>
                </Button>
              </>
            )}
            <p className="pt-1 text-center text-xs text-subtle-foreground">
              Free to start, no card needed. 0% platform fee.
            </p>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
