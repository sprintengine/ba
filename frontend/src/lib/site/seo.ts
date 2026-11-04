import type { PublicBusiness, SiteImage } from "@/lib/api/types";

/** Title, description and share image for a business's public site (from `site.seo`, else derived). */
export function siteSeo(b: PublicBusiness): { title: string; description: string; image: string | null } {
  const seo = b.site?.plan.seo;
  return {
    title: seo?.title?.trim() || b.name,
    description: seo?.description?.trim() || fallbackDescription(b),
    image: shareImage(b),
  };
}

/** The business's own description, else "Book appointments with X online in Y. …". */
function fallbackDescription(b: PublicBusiness): string {
  const own = b.description?.trim();
  if (own) return own;
  const bookings = b.vocabulary.bookings.toLowerCase() || "appointments";
  const where = b.address.city ? ` in ${b.address.city}` : "";
  return `Book ${bookings} with ${b.name} online${where}. See live availability and get instant confirmation.`;
}

/** The enabled hero's photo (generated art can't be shared as an image), else the cover image. */
function shareImage(b: PublicBusiness): string | null {
  const hero = b.site?.plan.sections.find((s) => s.type === "hero" && s.enabled);
  const heroImage: SiteImage | null = hero?.type === "hero" ? hero.content.image : null;
  return (heroImage?.kind !== "generated" && heroImage?.url) || b.branding.coverImageUrl || null;
}
