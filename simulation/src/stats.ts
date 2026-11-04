/** Counters and latency percentiles for the run's report. */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * The endpoint a request hit, with ids and tokens replaced: `POST /v1/businesses/{id}/bookings/{id}/cancel`,
 * `GET /v1/public/manage/{token}`. Query strings are dropped.
 */
export function endpointOf(method: string, url: string): string {
  let path = url.replace(/^[a-z]+:\/\/[^/]+/i, "").split("?")[0] ?? "";
  path = path.replace(/^\/api(?=\/v1\/)/, "");
  path = path.replace(UUID, "{id}");
  path = path.replace(/\/manage\/[^/]+/, "/manage/{token}");
  path = path.replace(/\/invitations\/[^/]+/, "/invitations/{token}");
  path = path.replace(/\/public\/businesses\/[^/]+/, "/public/businesses/{slug}");
  return `${method.toUpperCase()} ${path}`;
}

/** The [p]th percentile (0..100) of [sorted] ascending values, nearest rank. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? 0;
}

export type LatencyRow = {
  endpoint: string;
  count: number;
  p50: number;
  p95: number;
  max: number;
  errors: number;
};

export class Stats {
  private readonly latencies = new Map<string, number[]>();
  private readonly errors = new Map<string, number>();
  private readonly statuses = new Map<number, number>();
  readonly actions = new Map<string, Map<string, number>>();
  requests = 0;

  recordRequest(endpoint: string, status: number, ms: number) {
    this.requests++;
    let list = this.latencies.get(endpoint);
    if (!list) this.latencies.set(endpoint, (list = [] as number[]));
    list.push(ms);
    this.statuses.set(status, (this.statuses.get(status) ?? 0) + 1);
    if (status === 0 || status >= 500) this.errors.set(endpoint, (this.errors.get(endpoint) ?? 0) + 1);
  }

  /** One finished action: its kind and how it ended (`ok`, `slot_taken`, `plan_limit`, `skipped`, `failed`...). */
  recordAction(kind: string, outcome: string) {
    let byOutcome = this.actions.get(kind);
    if (!byOutcome) this.actions.set(kind, (byOutcome = new Map<string, number>()));
    byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + 1);
  }

  actionCount(): number {
    let n = 0;
    for (const byOutcome of this.actions.values()) for (const c of byOutcome.values()) n += c;
    return n;
  }

  statusCounts(): Record<string, number> {
    return Object.fromEntries(
      [...this.statuses.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => [String(s), c]),
    );
  }

  latencyRows(): LatencyRow[] {
    return [...this.latencies.entries()]
      .map(([endpoint, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          endpoint,
          count: sorted.length,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          max: sorted[sorted.length - 1] ?? 0,
          errors: this.errors.get(endpoint) ?? 0,
        };
      })
      .sort((a, b) => b.count - a.count || a.endpoint.localeCompare(b.endpoint));
  }

  actionRows(): { kind: string; total: number; outcomes: Record<string, number> }[] {
    return [...this.actions.entries()]
      .map(([kind, byOutcome]) => ({
        kind,
        total: [...byOutcome.values()].reduce((a, b) => a + b, 0),
        outcomes: Object.fromEntries([...byOutcome.entries()].sort((a, b) => b[1] - a[1])),
      }))
      .sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind));
  }
}
