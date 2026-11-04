/**
 * The action log: one JSON object per line (JSONL), every action and request with the seed, actor, status and
 * X-Request-Id, written as the run goes. The most recent entries stay in memory so a violation can be printed with the
 * trail that led to it.
 */
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

export type LogEntry = {
  type: "run" | "action" | "request" | "violation" | "check" | "note" | "summary";
  t: string;
  [key: string]: unknown;
};

export class ActionLog {
  private readonly recent: LogEntry[] = [];
  private stream: WriteStream | null = null;

  constructor(
    path: string | null,
    private readonly keep = 5000,
  ) {
    if (path) {
      mkdirSync(dirname(path), { recursive: true });
      this.stream = createWriteStream(path, { flags: "w" });
    }
  }

  write(entry: Omit<LogEntry, "t"> & { t?: string }): LogEntry {
    const full = { ...entry, t: entry.t ?? new Date().toISOString() } as LogEntry;
    this.recent.push(full);
    if (this.recent.length > this.keep) this.recent.splice(0, this.recent.length - this.keep);
    this.stream?.write(`${JSON.stringify(full)}\n`);
    return full;
  }

  /**
   * The minimal trail for a violation: the recent entries about the same booking, business or action (requests and
   * actions only), the last [limit] of them, oldest first.
   */
  trailFor(context: { businessId?: string; bookingId?: string; actionSeq?: number }, limit = 25): LogEntry[] {
    // The checker's own reads (sequence 0) are left out. A booking's trail is every entry that names it, and every
    // request of an action that does (the request that created it came back before the action knew its id).
    const bookingId = context.bookingId;
    const names = (e: LogEntry) =>
      bookingId !== undefined &&
      ((Array.isArray(e.bookingIds) && e.bookingIds.includes(bookingId)) ||
        (typeof e.path === "string" && e.path.includes(bookingId)));
    const actions = new Set(this.recent.filter((e) => e.seq !== 0 && names(e)).map((e) => e.seq));
    const matches = (e: LogEntry) =>
      (e.type === "action" || e.type === "request") &&
      e.seq !== 0 &&
      ((bookingId !== undefined && (names(e) || actions.has(e.seq))) ||
        (context.actionSeq !== undefined && context.actionSeq !== 0 && e.seq === context.actionSeq) ||
        (bookingId === undefined && context.businessId !== undefined && e.businessId === context.businessId));
    return this.recent.filter(matches).slice(-limit);
  }

  async close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    await new Promise<void>((resolve) => stream.end(resolve));
  }
}

/** One line of a trail for people: `12:00:01 #42 customer-3 POST /v1/... -> 409 SLOT_UNAVAILABLE (req sim-...)`. */
export function formatTrailEntry(e: LogEntry): string {
  const time = e.t.slice(11, 23);
  if (e.type === "request") {
    const code = typeof e.code === "string" ? ` ${e.code}` : "";
    return `${time} #${String(e.seq)} ${String(e.actor)} ${String(e.method)} ${String(e.path)} -> ${String(e.status)}${code} (${String(e.requestId)})`;
  }
  const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
  return `${time} #${String(e.seq)} ${String(e.actor)} ${String(e.kind)} => ${String(e.outcome)}${detail}`;
}

/** Reads a JSONL log (for `replay` and `report`). */
export function parseLog(text: string): LogEntry[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogEntry);
}
