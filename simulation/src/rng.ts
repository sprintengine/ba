/**
 * Seeded randomness. Every choice the simulation makes comes from an `Rng` derived from the run's seed, so a seed
 * names one run: the same seed against a fresh stack makes the same decisions (docs/simulation.md, "Replaying").
 *
 * Streams are derived by label (`rng.child("action:42")`), never by consumption order, so what one action draws does
 * not shift what another draws when concurrent actions interleave differently.
 */

/** A 32-bit hash of a string (cyrb53's mixing, folded to 32 bits). */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** [label] names the stream: the run's seed for the root, `seed/child/...` below it. */
  constructor(readonly label: string) {
    this.a = hashString(`${label}#a`);
    this.b = hashString(`${label}#b`);
    this.c = hashString(`${label}#c`);
    this.d = hashString(`${label}#d`) | 1;
    // Warm up so near-identical labels diverge.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** A float in [0, 1) (sfc32). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** An integer in [min, max], both included. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Empty range ${min}..${max}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability [p]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** One element, or undefined for an empty list. */
  maybePick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : this.pick(items);
  }

  /** A value chosen in proportion to its weight; entries with weight 0 are never chosen. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) throw new Error("weighted pick with no positive weight");
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return value;
    }
    // Floating point: the last positive entry.
    return [...entries].reverse().find(([, w]) => w > 0)![0];
  }

  /** A shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** Up to [n] distinct elements, in random order. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, n));
  }

  /** An independent stream named [name] under this one; the same name always gives the same stream. */
  child(name: string): Rng {
    return new Rng(`${this.label}/${name}`);
  }

  /** A short lowercase token (for names and keys), e.g. `k3f9qz`. */
  token(length = 6): string {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(this.next() * alphabet.length)];
    return out;
  }
}
