/**
 * Bundle-size budget: what each key route ships on first load (gzip), checked against `perf/bundle-baseline.json`.
 *
 *   npm run build && npm run perf:bundle              # compare, fail when a route grew beyond the tolerance
 *   npm run perf:bundle -- --update                   # re-record the baseline (deliberately; say why in the commit)
 *   npm run perf:bundle -- --dir ../other/.next       # measure another build
 *
 * Next 16 no longer prints "First Load JS", so this reads the build the way Next's own `route-bundle-stats` does:
 * a route's first load is the union of `entryJSFiles` over every segment of its page in the client reference
 * manifest (`.next/server/app/<page>_client-reference-manifest.js`: root layout, error and not-found boundaries,
 * nested layouts, the page) plus the runtime in `build-manifest.json` `rootMainFiles`. CSS is the union of
 * `entryCSSFiles`. Each file is gzipped at zlib's default level, which is what `next start` sends. Lazy chunks
 * (`next/dynamic`, `import()`) are not first load; they count towards `allJs`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import {
  type BundleBaseline,
  type BundleSnapshot,
  type RouteSize,
  compareBundles,
  formatTable,
  toBaseline,
  verdict,
} from "../perf/lib/bundle.ts";

/** Key routes (the patterns in `.next/app-path-routes-manifest.json`). Add one here, then `--update`. */
const TRACKED_ROUTES = [
  "/",
  "/pricing",
  "/for/[industry]",
  "/explore",
  "/sign-in/[[...sign-in]]",
  "/[slug]",
  "/[slug]/book",
  "/manage/[token]",
  "/my",
  "/my/bookings",
  "/onboarding",
  "/dashboard/[slug]",
  "/dashboard/[slug]/bookings",
  "/dashboard/[slug]/calendar",
  "/dashboard/[slug]/customers",
  "/dashboard/[slug]/services",
  "/dashboard/[slug]/reports",
  "/dashboard/[slug]/site",
  "/dashboard/[slug]/settings/general",
] as const;

type ManifestEntry = {
  entryJSFiles?: Record<string, string[]>;
  entryCSSFiles?: Record<string, { path: string; inlined?: boolean }[]>;
};

const FRONTEND = path.resolve(import.meta.dirname, "..");

function args(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    update: argv.includes("--update"),
    dir: path.resolve(value("--dir") ?? path.join(FRONTEND, ".next")),
    baseline: path.resolve(value("--baseline") ?? path.join(FRONTEND, "perf/bundle-baseline.json")),
  };
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

function makeSizer(distDir: string) {
  const cache = new Map<string, { raw: number; gzip: number }>();
  return (rel: string) => {
    let size = cache.get(rel);
    if (!size) {
      const buf = readFileSync(path.join(distDir, rel));
      size = { raw: buf.length, gzip: gzipSync(buf).length };
      cache.set(rel, size);
    }
    return size;
  };
}

/** The page's client reference manifest; it is a script that assigns `globalThis.__RSC_MANIFEST[page]`. */
function readClientManifest(distDir: string, appPath: string): ManifestEntry {
  const file = path.join(distDir, "server/app", `${appPath}_client-reference-manifest.js`);
  const sandbox: { __RSC_MANIFEST?: Record<string, ManifestEntry> } = {};
  runInNewContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  const entry = sandbox.__RSC_MANIFEST?.[appPath];
  if (!entry) throw new Error(`${file} has no entry for ${appPath}`);
  return entry;
}

function filesUnder(dir: string, ext: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => path.join(d.parentPath, d.name));
}

function measureBuild(distDir: string): BundleSnapshot {
  const routesManifest = readJson(path.join(distDir, "app-path-routes-manifest.json")) as Record<
    string,
    string
  >;
  const buildManifest = readJson(path.join(distDir, "build-manifest.json")) as { rootMainFiles?: string[] };
  const runtime = buildManifest.rootMainFiles ?? [];
  const size = makeSizer(distDir);

  const routes: Record<string, RouteSize> = {};
  const jsSets: Set<string>[] = [];
  for (const [appPath, route] of Object.entries(routesManifest)) {
    if (!appPath.endsWith("/page")) continue;
    const entry = readClientManifest(distDir, appPath);
    const js = new Set(
      [...Object.values(entry.entryJSFiles ?? {}).flat(), ...runtime].filter((f) => f.endsWith(".js")),
    );
    const css = new Set(
      Object.values(entry.entryCSSFiles ?? {}).flatMap((files) => files.map((f) => f.path)),
    );
    jsSets.push(js);
    const sum = (files: Set<string>, key: "raw" | "gzip") => [...files].reduce((n, f) => n + size(f)[key], 0);
    routes[route] = { js: sum(js, "gzip"), jsRaw: sum(js, "raw"), css: sum(css, "gzip"), chunks: js.size };
  }

  const shared = jsSets.reduce((acc, set) => new Set([...acc].filter((f) => set.has(f))));
  const staticDir = path.join(distDir, "static");
  const total = (files: string[]) => files.reduce((n, f) => n + size(path.relative(distDir, f)).gzip, 0);
  return {
    routes,
    totals: {
      sharedJs: [...shared].reduce((n, f) => n + size(f).gzip, 0),
      allJs: total(filesUnder(staticDir, ".js")),
      allCss: total(filesUnder(staticDir, ".css")),
    },
  };
}

function main() {
  const opts = args(process.argv.slice(2));
  const current = measureBuild(opts.dir);
  const nextVersion = (readJson(path.join(FRONTEND, "node_modules/next/package.json")) as { version: string })
    .version;

  if (opts.update) {
    const missing = TRACKED_ROUTES.filter((r) => !(r in current.routes));
    if (missing.length > 0) throw new Error(`Tracked routes not in the build: ${missing.join(", ")}`);
    writeFileSync(
      opts.baseline,
      `${JSON.stringify(toBaseline(current, TRACKED_ROUTES, nextVersion), null, 2)}\n`,
    );
    console.log(`Recorded ${path.relative(process.cwd(), opts.baseline)}:`);
  }

  const baseline = readJson(opts.baseline) as BundleBaseline;
  const rows = compareBundles(baseline, current, TRACKED_ROUTES);
  console.log(formatTable(rows));
  const result = verdict(rows);
  console.log(`\n${result.messages.join("\n")}`);
  if (baseline.nextVersion && baseline.nextVersion !== nextVersion) {
    console.log(`Note: the baseline was recorded with Next ${baseline.nextVersion}, this is ${nextVersion}.`);
  }
  if (!result.ok) process.exitCode = 1;
}

main();
