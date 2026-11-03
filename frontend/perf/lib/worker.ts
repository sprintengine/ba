/**
 * The website's Cloudflare Worker against Workers' size limit (`npm run cf:check`, CI's Frontend job). Cloudflare counts
 * the gzipped upload, which `wrangler deploy --dry-run` reports.
 */

/** Workers' limit on the gzipped Worker on the paid plan (the free plan's is 3 MiB, which this app is above). */
export const WORKER_LIMIT_KIB = 10 * 1024;

/** Below this much headroom the check warns, so the limit is never met by surprise. */
export const WORKER_WARN_KIB = 9 * 1024;

/** `Total Upload: 20060.89 KiB / gzip: 4650.54 KiB` → 4650.54. */
export function gzipKib(wranglerOutput: string): number {
  const match = /Total Upload: [\d.]+ KiB \/ gzip: ([\d.]+) KiB/.exec(wranglerOutput);
  if (!match?.[1]) throw new Error("wrangler's dry run did not report the upload size");
  return Number(match[1]);
}

export type WorkerVerdict = { level: "ok" | "warn" | "fail"; message: string };

export function judgeWorkerSize(kib: number): WorkerVerdict {
  const size = `${(kib / 1024).toFixed(2)} MiB gzipped`;
  if (kib > WORKER_LIMIT_KIB)
    return { level: "fail", message: `The Worker is ${size}, over Workers' 10 MiB limit.` };
  if (kib > WORKER_WARN_KIB)
    return { level: "warn", message: `The Worker is ${size}, within 1 MiB of Workers' 10 MiB limit.` };
  return { level: "ok", message: `The Worker is ${size} (limit 10 MiB).` };
}
