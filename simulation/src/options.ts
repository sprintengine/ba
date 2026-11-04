/** Command-line options (docs/simulation.md, "Options"); environment variables give defaults for CI and staging. */
import { parseArgs } from "node:util";
import { parseDuration } from "./time";

export type PaymentsMode = "dev" | "stripe-checkout";

export type Options = {
  command: "run" | "check" | "replay";
  /** API origin (`http://localhost:8097`) or the website's `/api` prefix (`https://staging.example.com/api`). */
  baseUrl: string;
  /** Where customers come back to after paying (the website's origin). */
  appUrl: string;
  seed: string;
  /** Whether the seed was given (`--seed` or SIM_SEED) rather than made up. */
  seedGiven: boolean;
  /** The options given on the command line or in the environment (a replay keeps these over the log's). */
  given: (keyof Options)[];
  durationMs: number;
  /** Actions started per minute, across all bots. */
  rate: number;
  /** Most actions in flight at once (1 = one after another, as `replay` runs). */
  concurrency: number;
  businesses: number;
  customers: number;
  checkEveryMs: number;
  /** Time after the last action for holds to lapse and jobs to drain before the final check. */
  settleMs: number;
  logPath: string | null;
  reportPath: string | null;
  /** Read-only SQL access for the checker (optional). */
  databaseUrl: string | null;
  payments: PaymentsMode;
  /** With `stripe-checkout`: the share of paid bookings paid through Checkout; the rest are abandoned or cancelled. */
  stripeShare: number;
  /** Drive one Free business to its monthly limit (and race past it) at the start. */
  planLimit: boolean;
  strict: boolean;
  failFast: boolean;
  /** `replay`/`check`: the log to read the run's seed and options from. */
  fromLog: string | null;
  quiet: boolean;
};

const DEFAULTS = {
  baseUrl: "http://localhost:8097",
  duration: "10m",
  rate: "90",
  concurrency: "8",
  businesses: "3",
  customers: "30",
  checkEvery: "60s",
  settle: "90s",
  log: "out/sim.jsonl",
  report: "out/report.md",
};

export const USAGE = `Usage: npm run sim -- [options]            (run)
       npm run check-world -- [options]    (check invariants once, no bots)
       npm run replay -- --from-log out/sim.jsonl [options]

  --base-url URL        API origin or the site's /api prefix (SIM_BASE_URL, default ${DEFAULTS.baseUrl})
  --app-url URL         website origin for payment return links (SIM_APP_URL, default: base URL's origin)
  --seed TEXT           seed (SIM_SEED, default: random, printed)
  --duration D          how long to run, e.g. 10m, 2h, 3d (SIM_DURATION, default ${DEFAULTS.duration})
  --rate N              actions per minute (SIM_RATE, default ${DEFAULTS.rate})
  --concurrency N       most actions in flight (SIM_CONCURRENCY, default ${DEFAULTS.concurrency})
  --businesses N        businesses to create (SIM_BUSINESSES, default ${DEFAULTS.businesses})
  --customers N         distinct customers (SIM_CUSTOMERS, default ${DEFAULTS.customers})
  --check-every D       invariant check interval (default ${DEFAULTS.checkEvery})
  --settle D            wait after the last action before the final check (SIM_SETTLE, default ${DEFAULTS.settle})
  --log PATH            JSONL action log (SIM_LOG, default ${DEFAULTS.log}, out/replay.jsonl for a replay; "-" for none)
  --report PATH         Markdown report (SIM_REPORT, default ${DEFAULTS.report}, out/replay.md for a replay; "-" for none)
  --database-url URL    read-only Postgres URL for SQL checks (SIM_DATABASE_URL)
  --payments dev|stripe-checkout   how bots pay (SIM_PAYMENTS, default dev)
  --stripe-share F      share of paid bookings paid through Stripe Checkout (SIM_STRIPE_SHARE, default 0.1)
  --no-plan-limit       skip the Free plan limit scenario
  --strict              known failures fail the run too
  --fail-fast           stop at the first failing violation
  --from-log PATH       replay/check: take the seed and options from this log
  --quiet               no progress lines
`;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function positiveInt(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`--${name} must be a positive whole number (got '${value}')`);
  return n;
}

function oneOf<T extends string>(value: string, name: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`--${name} must be one of ${allowed.join(", ")} (got '${value}')`);
  }
  return value as T;
}

/** A fresh seed: readable, unique enough for runs started the same second. */
export function randomSeed(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0")}`;
}

export function parseOptions(argv: string[]): Options {
  const [first, ...rest] = argv;
  const command = first === "check" || first === "replay" || first === "run" ? first : "run";
  const args = first === command ? rest : argv;
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      "base-url": { type: "string" },
      "app-url": { type: "string" },
      seed: { type: "string" },
      duration: { type: "string" },
      rate: { type: "string" },
      concurrency: { type: "string" },
      businesses: { type: "string" },
      customers: { type: "string" },
      "check-every": { type: "string" },
      settle: { type: "string" },
      log: { type: "string" },
      report: { type: "string" },
      "database-url": { type: "string" },
      payments: { type: "string" },
      "stripe-share": { type: "string" },
      "no-plan-limit": { type: "boolean" },
      strict: { type: "boolean" },
      "fail-fast": { type: "boolean" },
      "from-log": { type: "string" },
      quiet: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const baseUrl = (values["base-url"] ?? env("SIM_BASE_URL") ?? DEFAULTS.baseUrl).replace(/\/+$/, "");
  const share = Number(values["stripe-share"] ?? env("SIM_STRIPE_SHARE") ?? "0.1");
  if (!(share >= 0 && share <= 1)) throw new Error("--stripe-share must be between 0 and 1");
  // `check` writes nothing unless asked, and a replay writes beside the run it repeats rather than over its log.
  const outputs = {
    run: [DEFAULTS.log, DEFAULTS.report],
    replay: ["out/replay.jsonl", "out/replay.md"],
    check: ["-", "-"],
  };
  const [defaultLog, defaultReport] = outputs[command];
  const log = values.log ?? env("SIM_LOG") ?? defaultLog!;
  const report = values.report ?? env("SIM_REPORT") ?? defaultReport!;
  return {
    command,
    baseUrl,
    appUrl: (values["app-url"] ?? env("SIM_APP_URL") ?? new URL(baseUrl).origin).replace(/\/+$/, ""),
    seed: values.seed ?? env("SIM_SEED") ?? randomSeed(),
    seedGiven: (values.seed ?? env("SIM_SEED")) !== undefined,
    given: givenKeys(values),
    durationMs: parseDuration(values.duration ?? env("SIM_DURATION") ?? DEFAULTS.duration),
    rate: positiveInt(values.rate ?? env("SIM_RATE") ?? DEFAULTS.rate, "rate"),
    concurrency:
      command === "replay" && !values.concurrency
        ? 1
        : positiveInt(values.concurrency ?? env("SIM_CONCURRENCY") ?? DEFAULTS.concurrency, "concurrency"),
    businesses: positiveInt(values.businesses ?? env("SIM_BUSINESSES") ?? DEFAULTS.businesses, "businesses"),
    customers: positiveInt(values.customers ?? env("SIM_CUSTOMERS") ?? DEFAULTS.customers, "customers"),
    checkEveryMs: parseDuration(values["check-every"] ?? DEFAULTS.checkEvery),
    settleMs: parseDuration(values.settle ?? env("SIM_SETTLE") ?? DEFAULTS.settle),
    logPath: log === "-" ? null : log,
    reportPath: report === "-" ? null : report,
    databaseUrl: values["database-url"] ?? env("SIM_DATABASE_URL") ?? null,
    payments: oneOf(values.payments ?? env("SIM_PAYMENTS") ?? "dev", "payments", [
      "dev",
      "stripe-checkout",
    ] as const),
    stripeShare: share,
    planLimit: !values["no-plan-limit"],
    strict: values.strict ?? false,
    failFast: values["fail-fast"] ?? false,
    fromLog: values["from-log"] ?? null,
    quiet: values.quiet ?? false,
  };
}

/** The options a replay takes from the run it repeats: everything that shapes decisions, not where output goes. */
export const REPLAYED_OPTIONS = [
  "seed",
  "durationMs",
  "rate",
  "businesses",
  "customers",
  "planLimit",
  "payments",
  "stripeShare",
] as const satisfies readonly (keyof Options)[];

/**
 * [options] with the decision-shaping ones taken from [recorded] (a run's log header), except those given explicitly
 * (`replay --from-log out/sim.jsonl --duration 2m` replays that run for two minutes).
 */
export function replayOptions(options: Options, recorded: Partial<Options>): Options {
  const out: Options = { ...options };
  for (const key of REPLAYED_OPTIONS) {
    if (recorded[key] !== undefined && !options.given.includes(key))
      (out as Record<string, unknown>)[key] = recorded[key];
  }
  if (!options.given.includes("seed")) out.seedGiven = recorded.seedGiven ?? true;
  return out;
}

/** Which option each flag and environment variable sets (for [Options.given]). */
const SOURCES: Partial<Record<keyof Options, [flag: string, variable?: string]>> = {
  seed: ["seed", "SIM_SEED"],
  durationMs: ["duration", "SIM_DURATION"],
  rate: ["rate", "SIM_RATE"],
  businesses: ["businesses", "SIM_BUSINESSES"],
  customers: ["customers", "SIM_CUSTOMERS"],
  planLimit: ["no-plan-limit"],
  payments: ["payments", "SIM_PAYMENTS"],
  stripeShare: ["stripe-share", "SIM_STRIPE_SHARE"],
};

function givenKeys(values: Record<string, unknown>): (keyof Options)[] {
  return (Object.entries(SOURCES) as [keyof Options, [string, string?]][])
    .filter(
      ([, [flag, variable]]) =>
        values[flag] !== undefined || (variable !== undefined && env(variable) !== undefined),
    )
    .map(([key]) => key);
}
