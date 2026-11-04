"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Menu, Phone, X } from "lucide-react";
import { BusinessTile } from "@/components/shells/business-tile";
import type { ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookButton, SiteContainer } from "./primitives";
import { useSiteRender } from "./site-render-context";

export type NavItem = { anchor: string; label: string };

/**
 * Site header in the theme's style: `bar` (utility strip + header), `floating` (a pill that floats
 * over the page), `solid` (inverted band), `centered` (editorial masthead) or `minimal`.
 */
export function SiteHeader({ nav, action }: { nav: NavItem[]; action?: React.ReactNode }) {
  const { theme } = useSiteRender();
  switch (theme.header) {
    case "bar":
      return <BarHeader nav={nav} action={action} />;
    case "floating":
      return <FloatingHeader nav={nav} action={action} />;
    case "solid":
      return <SolidHeader nav={nav} action={action} />;
    case "centered":
      return <CenteredHeader nav={nav} action={action} />;
    default:
      return <MinimalHeader nav={nav} action={action} />;
  }
}

type HeaderProps = { nav: NavItem[]; action?: React.ReactNode };

function Brand({ inverted = false, large = false }: { inverted?: boolean; large?: boolean }) {
  const { business } = useSiteRender();
  return (
    <Link
      href={`/${business.slug}`}
      className="focus-ring flex min-h-11 min-w-0 items-center gap-2.5 rounded-md"
    >
      <BusinessTile
        name={business.name}
        logoUrl={business.branding.logoUrl}
        color={business.branding.primaryColor}
        size="lg"
        className={cn("size-9", large && "@3xl:size-11")}
      />
      <span
        className={cn(
          "site-heading line-clamp-2 text-base leading-tight @3xl:text-lg",
          large && "@3xl:text-2xl",
          inverted && "text-background",
        )}
      >
        {business.name}
      </span>
    </Link>
  );
}

function Nav({
  nav,
  className,
  linkClassName,
}: {
  nav: NavItem[];
  className?: string;
  linkClassName?: string;
}) {
  if (nav.length === 0) return null;
  return (
    <nav aria-label="Site" className={cn("hidden items-center gap-1 @4xl:flex", className)}>
      {nav.map((n) => (
        <a
          key={n.anchor}
          href={`#${n.anchor}`}
          className={cn(
            "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11",
            linkClassName,
          )}
        >
          {n.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * The sections on narrow pages, where the inline nav is hidden: a menu glyph that opens the links in a panel below
 * the header. A panel inside the header rather than a portalled menu, so it keeps the site's theme.
 */
function NavMenu({ nav, className }: { nav: NavItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // Escape closes it, like any menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (nav.length === 0) return null;
  return (
    <div className={cn("@4xl:hidden", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "Close menu" : "Menu"}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex size-11 items-center justify-center rounded-button text-current transition-colors hover:bg-current/10"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {open && (
        <nav
          id={id}
          aria-label="Site"
          className="absolute inset-x-3 top-[calc(100%+0.5rem)] z-40 flex animate-pop-in flex-col rounded-2xl border border-border bg-surface p-2 text-foreground shadow-lg"
        >
          {nav.map((n) => (
            <a
              key={n.anchor}
              href={`#${n.anchor}`}
              onClick={() => setOpen(false)}
              className="flex h-11 items-center rounded-lg px-3 text-base font-medium transition-colors hover:bg-accent"
            >
              {n.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

/** The header's Book button; narrow pages have the Book bar at the bottom instead, so the name has room here. */
function HeaderBookButton({
  size,
  className,
  children,
}: Pick<ButtonProps, "size" | "className" | "children">) {
  return (
    <BookButton size={size} className={cn("@max-3xl:hidden", className)}>
      {children}
    </BookButton>
  );
}

function BookLabel() {
  const { plan } = useSiteRender();
  const hero = plan.sections.find((s) => s.type === "hero");
  return <>{(hero?.type === "hero" && hero.content.ctaLabel) || "Book now"}</>;
}

function BarHeader({ nav, action }: HeaderProps) {
  const { business, context } = useSiteRender();
  const openDays = context.openingHours.filter((d) => d.intervals.length > 0).length;
  const city = business.address.city;
  return (
    <header className="sticky top-0 z-30">
      <div className="hidden bg-foreground text-background @3xl:block">
        <SiteContainer className="flex h-9 items-center justify-between gap-4 text-xs pointer-coarse:h-11">
          <span className="truncate opacity-80">
            {[
              city,
              openDays > 0 ? `Open ${openDays} day${openDays === 1 ? "" : "s"} a week` : null,
              "Book online any time",
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </span>
          {business.contactPhone && (
            <a
              href={`tel:${business.contactPhone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-1.5 self-stretch font-medium hover:underline"
            >
              <Phone className="size-3.5" aria-hidden /> {business.contactPhone}
            </a>
          )}
        </SiteContainer>
      </div>
      <div className="border-b border-border bg-surface/90 backdrop-blur-xl">
        <SiteContainer className="flex h-16 items-center gap-4">
          <Brand />
          <Nav nav={nav} className="ml-auto" />
          <div className="ml-auto flex items-center gap-2 @4xl:ml-2">
            {action}
            <HeaderBookButton size="md">
              <BookLabel />
            </HeaderBookButton>
            <NavMenu nav={nav} />
          </div>
        </SiteContainer>
      </div>
    </header>
  );
}

function FloatingHeader({ nav, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 @3xl:px-5 @3xl:pt-4">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 rounded-full border border-border/70 bg-surface/80 pr-2 pl-3 shadow-sm backdrop-blur-xl @3xl:pl-4">
        <Brand />
        <Nav nav={nav} className="mx-auto" linkClassName="rounded-full" />
        <div className="ml-auto flex items-center gap-2 @4xl:ml-0">
          {action}
          <HeaderBookButton size="md">
            <BookLabel />
          </HeaderBookButton>
          <NavMenu nav={nav} />
        </div>
      </div>
    </header>
  );
}

function SolidHeader({ nav, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-foreground text-background">
      <SiteContainer className="flex h-16 items-center gap-4 @3xl:h-18">
        <Brand inverted />
        <Nav
          nav={nav}
          className="ml-auto"
          linkClassName="text-background/70 hover:text-background uppercase tracking-wider text-xs font-bold"
        />
        <div className="ml-auto flex items-center gap-2 @4xl:ml-2 [&_a]:text-inherit">
          <span className="text-background/80 [&_a:hover]:bg-background/10">{action}</span>
          <HeaderBookButton size="md" className="tracking-wide uppercase">
            <BookLabel />
          </HeaderBookButton>
          <NavMenu nav={nav} />
        </div>
      </SiteContainer>
    </header>
  );
}

function CenteredHeader({ nav, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <SiteContainer className="flex h-16 items-center gap-3 @4xl:h-auto @4xl:flex-col @4xl:gap-0 @4xl:pt-5">
        <div className="flex w-full items-center gap-3 @4xl:grid @4xl:grid-cols-[1fr_auto_1fr]">
          <div className="hidden @4xl:block">{action}</div>
          <Brand large />
          <div className="ml-auto flex items-center gap-2 @4xl:justify-self-end">
            <span className="@4xl:hidden">{action}</span>
            <HeaderBookButton size="md">
              <BookLabel />
            </HeaderBookButton>
            <NavMenu nav={nav} />
          </div>
        </div>
        <Nav
          nav={nav}
          className="mt-3 w-full justify-center gap-6 border-t border-border-subtle py-1"
          linkClassName="text-xs uppercase tracking-[0.18em]"
        />
      </SiteContainer>
    </header>
  );
}

function MinimalHeader({ nav, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
      <SiteContainer className="flex h-16 items-center gap-4">
        <Brand />
        <Nav nav={nav} className="ml-auto" />
        <div className="ml-auto flex items-center gap-2 @4xl:ml-2">
          {action}
          <HeaderBookButton size="sm">
            <BookLabel />
          </HeaderBookButton>
          <NavMenu nav={nav} />
        </div>
      </SiteContainer>
    </header>
  );
}
