import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["button-sm", "button", "button-lg", "image"],
      font: ["heading", "body"],
    },
    classGroups: {
      "font-size": [{ text: ["2xs", "display-sm", "display", "display-lg"] }],
    },
  },
});

/** Merge class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Initials for avatars: "Alex Morgan" → "AM". */
export function initials(name: string | null | undefined, fallback = "?") {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || fallback;
}

/**
 * Copies [text] to the clipboard. Resolves false where the Clipboard API is missing (insecure origins, some embedded
 * browsers; the DOM types claim it always exists) or the browser refuses.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = (navigator as Partial<Navigator>).clipboard;
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
