/**
 * Guard for the code the app shares with the website (docs/mobile.md "Shared code"). Walks the import graph from the
 * app's own source (app/, src/) into frontend/src and checks every website module the app actually reaches:
 *
 * - no web-only package (Next.js, react-dom, Radix, lucide-react…) and no website component (`@/components`);
 * - no browser global (window, document, localStorage…) and no DOM element (`<div>`);
 * - every package it imports is a dependency of the app, at the website's major version, with a tsconfig `paths`
 *   entry (so `tsc` and Metro resolve it from mobile/node_modules).
 *
 * The website lints the same rules per file (frontend eslint.config.mjs, WEB_ONLY_LIB); this sees the whole graph.
 * Run: `node scripts/shared-boundary.js` (also part of `npm test` via shared-boundary.test.js).
 */
const fs = require("node:fs");
const path = require("node:path");
const { MOBILE_ROOT, FRONTEND_SRC, isFrontendSource, resolveAlias } = require("../shared-code");

const WEB_ONLY_PACKAGES = [
  /^next(\/|$)/,
  /^react-dom(\/|$)/,
  /^@clerk\/nextjs/,
  /^next-themes$/,
  /^lucide-react$/,
  /^radix-ui/,
  /^@radix-ui\//,
  /^sonner$/,
  /^vaul$/,
  /^cmdk$/,
  /^motion(\/|$)/,
  /^recharts$/,
  /^three$/,
  /^clsx$/,
  /^tailwind-merge$/,
  /^class-variance-authority$/,
  /^server-only$/,
];
const BROWSER_GLOBAL =
  /(?<![.\w$])(window|document|localStorage|sessionStorage|navigator|location|history|IntersectionObserver|ResizeObserver|matchMedia)\s*[.([]/;
const DOM_ELEMENT = /<([a-z][a-z0-9]*)[\s>/]/;
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
const IMPORT =
  /^\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)|\bimport\(\s*["']([^"']+)["']\s*\)/gm;

function resolveFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (fs.existsSync(index)) return index;
  }
  return null;
}

function importsOf(source) {
  const out = [];
  for (const match of source.matchAll(IMPORT)) out.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  return out;
}

/** Source without comments and string contents, so prose about `window.` isn't a violation. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Website files reached from the app's source (tests and src/test excluded: they may import fixtures). */
function sharedClosure(entries) {
  const seen = new Set();
  const queue = [...entries];
  const shared = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(fs.readFileSync(file, "utf8"))) {
      const aliased = resolveAlias(specifier);
      const target = aliased
        ? resolveFile(aliased)
        : specifier.startsWith(".")
          ? resolveFile(path.resolve(path.dirname(file), specifier))
          : null;
      if (!target) continue;
      if (isFrontendSource(target)) shared.add(target);
      queue.push(target);
    }
  }
  return [...shared].sort();
}

/**
 * The first browser global the code uses, or null. A name the module binds itself (a `const location`, a parameter
 * called `history`) is its own variable, not the global.
 */
function browserGlobal(code) {
  const pattern = new RegExp(BROWSER_GLOBAL.source, "g");
  for (const match of code.matchAll(pattern)) {
    const name = match[1];
    const bound = new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b|[(,]\\s*${name}\\s*\\??:`).test(
      code,
    );
    if (!bound) return name;
  }
  return null;
}

/** Problems in one website module, given the app's package.json, the website's and the tsconfig paths. */
function checkModule(file, source, { mobileDeps, frontendDeps, tsPaths }) {
  const rel = path.relative(path.dirname(FRONTEND_SRC), file);
  const problems = [];
  for (const specifier of importsOf(source)) {
    if (specifier.startsWith("@/components"))
      problems.push(`${rel}: imports a website component (${specifier})`);
    if (specifier.startsWith(".") || resolveAlias(specifier)) continue;
    if (WEB_ONLY_PACKAGES.some((re) => re.test(specifier))) {
      problems.push(`${rel}: imports the web-only package ${specifier}`);
      continue;
    }
    const name = packageName(specifier);
    if (!mobileDeps[name]) {
      problems.push(`${rel}: imports ${name}, which isn't a dependency of mobile/package.json`);
      continue;
    }
    const major = (range) => /\d+/.exec(range ?? "")?.[0];
    if (frontendDeps[name] && major(frontendDeps[name]) !== major(mobileDeps[name])) {
      problems.push(
        `${name}: mobile ${mobileDeps[name]} vs website ${frontendDeps[name]} (keep the same major)`,
      );
    }
    if (!tsPaths[specifier] && !tsPaths[`${name}/*`] && !tsPaths[name]) {
      problems.push(
        `${rel}: add "${name}" to mobile/tsconfig.json paths (resolve it from mobile/node_modules)`,
      );
    }
  }
  const code = codeOnly(source);
  const global = browserGlobal(code);
  if (global) problems.push(`${rel}: uses the browser global ${global}`);
  if (file.endsWith(".tsx")) {
    const element = DOM_ELEMENT.exec(code.replace(/<([a-z][a-z0-9]*)\s*(extends|,)/g, ""));
    if (element) problems.push(`${rel}: renders the DOM element <${element[1]}>`);
  }
  return problems;
}

function context() {
  const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const mobile = read(path.join(MOBILE_ROOT, "package.json"));
  const frontend = read(path.join(path.dirname(FRONTEND_SRC), "package.json"));
  const tsconfig = read(path.join(MOBILE_ROOT, "tsconfig.json"));
  return {
    mobileDeps: { ...mobile.dependencies, ...mobile.devDependencies },
    frontendDeps: { ...frontend.dependencies, ...frontend.devDependencies },
    tsPaths: tsconfig.compilerOptions.paths ?? {},
  };
}

function checkSharedBoundary() {
  const entries = [
    ...walk(path.join(MOBILE_ROOT, "app")),
    ...walk(path.join(MOBILE_ROOT, "src")).filter(
      (f) => !f.includes(`${path.sep}src${path.sep}test${path.sep}`),
    ),
  ];
  const files = sharedClosure(entries);
  const ctx = context();
  const problems = [...new Set(files.flatMap((f) => checkModule(f, fs.readFileSync(f, "utf8"), ctx)))];
  return { files, problems };
}

module.exports = { checkSharedBoundary, checkModule, sharedClosure };

if (require.main === module) {
  const { files, problems } = checkSharedBoundary();
  console.log(`shared-boundary: ${files.length} website modules shared with the app`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(problems.length ? 1 : 0);
}
