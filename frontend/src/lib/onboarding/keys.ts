import { trimHyphens } from "@/lib/slug";

/** Case- and whitespace-insensitive form of a name, for duplicate checks and name references. */
export function normName(name: string): string {
  return name.trim().toLowerCase();
}

/** A unique, slug-like key for a new resource/group: "Bay 3" → "bay-3" (or "bay-3-2" if taken). */
export function uniqueKey(label: string, taken: Iterable<string>, fallback = "item"): string {
  const used = new Set(taken);
  const base =
    trimHyphens(
      label
        .normalize("NFD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
    ).slice(0, 40) || fallback;
  return firstFree(base, (candidate) => used.has(candidate), "-");
}

/** [base], or "base 2", "base 3"… whichever no name in [taken] already uses (ignoring case). */
export function uniqueName(base: string, taken: string[]): string {
  const used = new Set(taken.map(normName));
  return firstFree(base, (candidate) => used.has(candidate.toLowerCase()), " ");
}

function firstFree(base: string, isTaken: (candidate: string) => boolean, separator: string): string {
  if (!isTaken(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${separator}${i}`;
    if (!isTaken(candidate)) return candidate;
  }
}
