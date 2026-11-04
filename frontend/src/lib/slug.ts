/**
 * Business web address rules, mirroring the backend's `ReservedSlugs` (`business/SetupInstaller.kt`): 3 to 50
 * lowercase letters, digits or single hyphens, starting and ending with a letter or digit, and not reserved.
 */
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

/** The backend's `ReservedSlugs.FORMAT` (consecutive hyphens are rejected separately). */
export const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
export const SLUG_MAX_LENGTH = 50;

/** Mirrors `ReservedSlugs.slugify`: "Café & Co" → "cafe-and-co"; short/reserved results get "-booking". */
export function slugify(name: string): string {
  const ascii = name.normalize("NFD").replace(/\p{M}+/gu, "");
  const s = trimHyphens(
    trimHyphens(
      ascii
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-"),
    ).slice(0, SLUG_MAX_LENGTH),
  );
  if (s.length < 3) return trimHyphens(`${s}-booking`);
  if (RESERVED_SLUGS.has(s) || looksLikeId(s)) return `${s}-booking`;
  return s;
}

/** Mirrors `ReservedSlugs.problem`: why [slug] can't be a web address, or null when it can. */
export function slugProblem(slug: string): string | null {
  if (!SLUG_FORMAT.test(slug)) return "Use 3 to 50 lowercase letters, numbers or hyphens";
  if (slug.includes("--")) return "Must not contain consecutive hyphens";
  if (RESERVED_SLUGS.has(slug) || looksLikeId(slug)) return "That address is reserved";
  return null;
}

/** A slug is never UUID-shaped: `GET /v1/businesses/{idOrSlug}` reads one as an id (`ReservedSlugs.looksLikeId`). */
function looksLikeId(slug: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(slug);
}

/** Normalises what the owner types into a slug box (lowercase, hyphens, no spaces). */
export function cleanSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

export function trimHyphens(s: string): string {
  return s.replace(/^-+|-+$/g, "");
}
