/** Pure helpers for site images (uploads, stock photos, generated backgrounds). */
import type { GeneratedPattern, SiteImage, StockPhoto, Upload } from "@/lib/api/types";

export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Why a file can't be uploaded (checked again by the server), or null. */
export function uploadProblem(file: { type: string; size: number }, maxBytes: number): string | null {
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG or WebP image.";
  if (file.size > maxBytes) return `Images can be at most ${Math.floor(maxBytes / (1024 * 1024))} MB.`;
  return null;
}

export function uploadedImage(upload: Pick<Upload, "url">, alt = ""): SiteImage {
  return { kind: "upload", url: upload.url, alt, pattern: null, attribution: null };
}

export function stockImage(photo: StockPhoto): SiteImage {
  return {
    kind: "stock",
    url: photo.url,
    alt: (photo.alt || "").slice(0, 140),
    pattern: null,
    attribution: photo.attribution,
  };
}

/** A generated background drawn from the palette (no external asset). */
export function generatedImage(pattern: GeneratedPattern, alt = ""): SiteImage {
  return { kind: "generated", url: null, alt, pattern, attribution: null };
}

/** Short label for an image slot. */
export function describeImage(image: SiteImage | null): string {
  if (!image) return "No image";
  if (image.kind === "generated") return `Generated · ${image.pattern ?? "pattern"}`;
  if (image.kind === "stock") return `Photo by ${image.attribution?.name ?? "Unsplash"}`;
  return "Your upload";
}
