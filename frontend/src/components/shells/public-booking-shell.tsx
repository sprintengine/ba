import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import type { Address, Branding, SitePalette, SiteThemeKey, Vocabulary } from "@/lib/api/types";
import { formatAddress } from "@/lib/booking/booking";
import { businessThemeVars } from "@/lib/theme/color";
import { touchHitArea } from "@/components/ui/touch";
import { VocabularyProvider } from "@/lib/vocabulary";
import { THEME_FONT_CLASSES } from "@/lib/site/fonts";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/brand/logo";
import { siteScopeProps } from "@/components/site/site-scope";
import { BusinessTile } from "./business-tile";

export type PublicShellBusiness = {
  name: string;
  slug: string;
  branding: Branding;
  description?: string | null;
  vocabulary?: Vocabulary | null;
  showBadge?: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: Address | null;
  /** When the business has a site, the booking pages share its theme and link back to it. */
  site?: { plan: { theme: SiteThemeKey; palette: SitePalette } } | null;
};

/**
 * Business-branded chrome for /[slug], /manage/[token]: header with logo/name,
 * optional cover image, contact footer, "Powered by bookanything" when
 * `showBadge`. Applies the business colour (BusinessThemeProvider) and
 * vocabulary to everything inside, so `variant="primary"` buttons are on-brand.
 * Pass `business={null}` while loading (with `loading`) or when there is no business to show (an error): the
 * header then holds a placeholder, or bookanything's logo.
 */
export function PublicBookingShell({
  business,
  loading = false,
  children,
  headerAction,
  showCover = true,
  width = "default",
  className,
}: {
  business: PublicShellBusiness | null;
  /** With no `business`: it is still loading (a placeholder where its name goes). */
  loading?: boolean;
  children: React.ReactNode;
  /** Right side of the header (e.g. "My bookings" link). */
  headerAction?: React.ReactNode;
  showCover?: boolean;
  /** "default" (max-w-3xl) or "wide" (max-w-6xl, for layouts with a side summary). */
  width?: "default" | "wide";
  className?: string;
}) {
  const container = width === "wide" ? "max-w-6xl" : "max-w-3xl";
  const cover = showCover ? business?.branding.coverImageUrl : null;
  const site = business?.site?.plan;
  return (
    <ShellTheme
      style={site ?? portalStyle(business?.branding)}
      primaryColor={business?.branding.primaryColor}
    >
      <VocabularyProvider vocabulary={business?.vocabulary}>
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className={cn("mx-auto flex h-16 items-center gap-3 px-5", container)}>
            {business ? (
              <ShellBrand business={business} linkHome={!!site} />
            ) : loading ? (
              <span className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
            ) : (
              <Link href="/" className="focus-ring flex min-h-11 items-center rounded-md">
                <Logo />
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">{headerAction}</div>
          </div>
        </header>

        {cover && (
          <div className={cn("mx-auto w-full px-0 sm:px-5 sm:pt-5", container)}>
            <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted sm:rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied cover URL */}
              <img src={cover} alt="" className="size-full object-cover" />
              <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
            </div>
          </div>
        )}

        <main id="main" className={cn("mx-auto w-full flex-1 px-5 py-8 sm:py-10", container, className)}>
          {children}
        </main>

        {business && (
          <footer className="border-t border-border">
            <div
              className={cn(
                "mx-auto flex flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between",
                container,
              )}
            >
              <ShellContacts business={business} />
              {business.showBadge && <PoweredByBadge />}
            </div>
          </footer>
        )}
      </VocabularyProvider>
    </ShellTheme>
  );
}

/** Logo and name; a link to the business's site when it has one. */
function ShellBrand({ business, linkHome }: { business: PublicShellBusiness; linkHome: boolean }) {
  const brand = (
    <>
      <BusinessTile
        name={business.name}
        logoUrl={business.branding.logoUrl}
        color={business.branding.primaryColor}
        size="lg"
        className="size-9"
      />
      <span className="line-clamp-2 text-base leading-tight font-semibold tracking-tight">
        {business.name}
      </span>
    </>
  );
  if (!linkHome) return brand;
  return (
    <Link
      href={`/${business.slug}`}
      className="focus-ring flex min-h-11 min-w-0 items-center gap-3 rounded-md"
      aria-label={`${business.name} home`}
    >
      {brand}
    </Link>
  );
}

/** Address, phone and email, each when set. */
function ShellContacts({ business }: { business: PublicShellBusiness }) {
  const address = business.address ? formatAddress(business.address) : "";
  return (
    <ul className="flex flex-col gap-1.5 pointer-coarse:gap-0">
      {address && (
        // On touch screens the links below are 44px tall; the same padding keeps the address evenly spaced above them.
        <li className="flex items-start gap-2 pointer-coarse:py-[11px]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /> {address}
        </li>
      )}
      {business.contactPhone && (
        <li className="flex items-center gap-2">
          <Phone className="size-4 text-subtle-foreground" />
          <a
            href={`tel:${business.contactPhone}`}
            className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-11"
          >
            {business.contactPhone}
          </a>
        </li>
      )}
      {business.contactEmail && (
        <li className="flex items-center gap-2">
          <Mail className="size-4 text-subtle-foreground" />
          <a
            href={`mailto:${business.contactEmail}`}
            className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-11"
          >
            {business.contactEmail}
          </a>
        </li>
      )}
    </ul>
  );
}

function PoweredByBadge() {
  return (
    <a
      href="https://bookanything.ie"
      target="_blank"
      rel="noopener"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground sm:self-auto",
        touchHitArea,
      )}
    >
      <LogoMark className="h-3.5 w-auto" aria-hidden title="" />
      Powered by bookanything
    </a>
  );
}

/** The booking portal's own style: the branding's preset in the brand colour (used when there is no site). */
function portalStyle(
  branding: Branding | undefined,
): { theme: SiteThemeKey; palette: SitePalette } | undefined {
  if (!branding?.portalStyle) return undefined;
  return { theme: branding.portalStyle, palette: { primaryColor: branding.primaryColor, accent: null } };
}

/**
 * The shell's colours and fonts for something rendered outside it, in a portal (e.g. the booking summary's drawer),
 * without the shell's layout classes.
 */
export function shellThemeProps(business: Pick<PublicShellBusiness, "branding" | "site"> | null | undefined) {
  const style = business?.site?.plan ?? portalStyle(business?.branding);
  if (!style) {
    const vars = businessThemeVars(business?.branding.primaryColor) as React.CSSProperties;
    return { "data-business-theme": "", style: vars };
  }
  const scope = siteScopeProps(style.theme, style.palette);
  return {
    "data-theme": scope["data-theme"],
    style: scope.style,
    className: THEME_FONT_CLASSES[style.theme],
  };
}

/**
 * The site's theme, else the branding's portal style, else just the brand colour (as `BusinessThemeProvider`). Always
 * the same element, so the page inside isn't remounted, losing its state, when the business and its site load.
 */
function ShellTheme({
  style,
  primaryColor,
  children,
}: {
  style: { theme: SiteThemeKey; palette: SitePalette } | undefined;
  primaryColor: string | undefined;
  children: React.ReactNode;
}) {
  const scope = style ? siteScopeProps(style.theme, style.palette) : null;
  return (
    <div
      data-theme={scope?.["data-theme"]}
      data-business-theme={scope ? undefined : ""}
      style={scope ? scope.style : businessThemeVars(primaryColor)}
      className={cn("flex min-h-dvh flex-col bg-background", scope?.className)}
    >
      {children}
    </div>
  );
}
