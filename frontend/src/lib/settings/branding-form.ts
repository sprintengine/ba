/**
 * Settings → Branding: the zod schema and Business ↔ form values ↔ UpdateBusiness. Kept free of React so it can be
 * unit-tested.
 */
import * as z from "zod";
import type { Business, SiteThemeKey, UpdateBusiness } from "@/lib/api/types";
import { SITE_THEME_KEYS } from "@/lib/site/themes";
import { HEX_COLOR } from "@/lib/theme/color";
import { BUSINESS_LIMITS } from "@/lib/validation/limits";
import { optionalHttpUrl } from "@/lib/validation/url";

const imageUrl = optionalHttpUrl("Enter a full image address starting with https://");
const word = z.string().trim().min(1, "Required").max(BUSINESS_LIMITS.vocabularyWord);

export const brandingSchema = z.object({
  primaryColor: z.string().regex(HEX_COLOR, "Use a hex colour like #0e7c70"),
  logoUrl: imageUrl,
  coverImageUrl: imageUrl,
  /** The booking portal's style preset. */
  portalStyle: z.enum(SITE_THEME_KEYS as [SiteThemeKey, ...SiteThemeKey[]]),
  resource: word,
  resources: word,
  customer: word,
  customers: word,
  booking: word,
  bookings: word,
});

export type BrandingValues = z.infer<typeof brandingSchema>;

export const businessToBrandingValues = (b: Business): BrandingValues => ({
  primaryColor: b.branding.primaryColor,
  logoUrl: b.branding.logoUrl ?? "",
  coverImageUrl: b.branding.coverImageUrl ?? "",
  // The API always sends one (the industry's default until chosen); Minimal for an older API.
  portalStyle: b.branding.portalStyle ?? "minimal",
  ...b.vocabulary,
});

export function brandingValuesToUpdate(v: BrandingValues): UpdateBusiness {
  return {
    branding: {
      primaryColor: v.primaryColor.toLowerCase(),
      logoUrl: v.logoUrl.trim() || null,
      coverImageUrl: v.coverImageUrl.trim() || null,
      portalStyle: v.portalStyle,
    },
    vocabulary: {
      resource: v.resource.trim(),
      resources: v.resources.trim(),
      customer: v.customer.trim(),
      customers: v.customers.trim(),
      booking: v.booking.trim(),
      bookings: v.bookings.trim(),
    },
  };
}
