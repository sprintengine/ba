// ESLint 10 flat config. Rationale for each choice lives in docs/engineering.md ("Frontend lint rules").
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

/** Every architectural element type; app routes and tests may depend on all of them. */
const ALL_ELEMENTS = ["app", "ui", "shared", "feature", "lib", "test-support"];

/**
 * Each feature's public entry points (paths inside `src/components/<feature>/`): the only files other features and the
 * shared chrome may import. Direct files rather than `index.ts` barrels, because a barrel that re-exports a heavy
 * client module (the site renderer, the booking flow) pulls it into every importer's bundle.
 */
const FEATURE_ENTRY_POINTS = {
  ai: ["credits.tsx"],
  assistant: ["bo-character.tsx", "dictation.tsx", "proposal-card.tsx"],
  booking: ["booking-flow.tsx", "portal-style-picker.tsx"],
  dashboard: ["common.tsx"],
  marketing: ["section.tsx", "legal/legal-toc.tsx"],
  notifications: ["notification-bell.tsx"],
  oauth: ["server-url-field.tsx"],
  offers: ["deal-price.tsx", "deals-strip.tsx", "offer-form-parts.tsx", "portal-deals.tsx"],
  site: [
    "generated-art.tsx",
    "primitives.tsx",
    "scaled-frame.tsx",
    "site-media.tsx",
    "site-render-context.tsx",
    "site-renderer.tsx",
    "site-scope.tsx",
    "theme-classes.ts",
    "theme-picker.tsx",
  ],
};

/** Turbopack can't shake zod's re-exported `z` namespace (see the rule below). */
const ZOD_NAMESPACE_IMPORT = {
  selector:
    "ImportDeclaration[source.value='zod'][importKind!='type'] > :matches(ImportDefaultSpecifier, ImportSpecifier[imported.name='z'][importKind!='type'])",
  message: 'Use `import * as z from "zod"`: the named `z` pulls every zod locale into the bundle.',
};

/**
 * The web-only modules of src/lib. Everything else in lib is shared with the mobile app (docs/mobile.md "Shared
 * code"), so it must also run on React Native: no DOM, no browser globals, no Next.js or web-only packages. Put a
 * module here only when it is about the browser itself (storage, the URL, the DOM, CSS); split pure logic out first.
 */
const WEB_ONLY_LIB = [
  "src/lib/api/server.ts",
  "src/lib/api/query-provider.tsx",
  "src/lib/assistant/dictation.ts",
  "src/lib/assistant/use-dictation.ts",
  "src/lib/auth/auth-provider.tsx",
  "src/lib/auth/clerk-auth-provider.tsx",
  "src/lib/auth/components.tsx",
  "src/lib/auth/config.ts",
  "src/lib/auth/dev-auth-provider.tsx",
  "src/lib/auth/dev-auth.ts",
  "src/lib/auth/server.ts",
  "src/lib/auth/signed-in-hint.ts",
  "src/lib/booking/calendar-links.ts",
  "src/lib/booking/details-storage.ts",
  "src/lib/download.ts",
  "src/lib/explore/category-icons.ts",
  "src/lib/hooks/use-idle-mount.ts",
  "src/lib/hooks/use-infinite-scroll-sentinel.ts",
  "src/lib/hooks/use-reduced-motion.ts",
  "src/lib/hooks/use-unsaved-changes-guard.ts",
  "src/lib/hooks/use-url-params.ts",
  "src/lib/oauth/app-url.ts",
  "src/lib/observability/sentry-client.ts",
  "src/lib/observability/sentry-loader.ts",
  "src/lib/observability/sentry-options.ts",
  "src/lib/observability/sentry-worker.ts",
  "src/lib/site/fonts.ts",
  "src/lib/theme/business-theme.tsx",
  "src/lib/theme/theme-provider.tsx",
  "src/lib/utils.ts",
  "src/lib/webmcp/**",
];

/** WEB_ONLY_LIB as import specifiers (`@/lib/download`), so a shared module can't reach the web through one. */
const WEB_ONLY_LIB_IMPORTS = WEB_ONLY_LIB.map((file) =>
  file
    .replace(/^src\//, "@/")
    .replace(/\.tsx?$/, "")
    .replace(/\/\*\*$/, "/*"),
);

/** next/font/google downloads the fonts while building, so a build fails whenever Google is unreachable. */
const NEXT_FONT_GOOGLE = {
  group: ["next/font/google", "next/font/google/*", "@next/font/google", "@next/font/google/*"],
  message:
    "It downloads fonts at build time: commit the files instead (src/lib/site/fonts.module.css, next/font/local).",
};

/** Packages that only exist (or only make sense) in a browser or in Next.js. */
const WEB_ONLY_PACKAGES = [
  "next",
  "next/*",
  "react-dom",
  "react-dom/*",
  "@clerk/nextjs",
  "@clerk/nextjs/*",
  "next-themes",
  "lucide-react",
  "radix-ui",
  "sonner",
  "vaul",
  "cmdk",
  "motion",
  "motion/*",
  "recharts",
  "three",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "server-only",
  "@sentry/nextjs",
  "@sentry/nextjs/*",
];

/** Browser globals; React Native has none of them. `fetch` stays banned as everywhere (use the API layer). */
const BROWSER_GLOBALS = [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "location",
  "history",
  "matchMedia",
  "getComputedStyle",
  "IntersectionObserver",
  "ResizeObserver",
  "MutationObserver",
].map((name) => ({
  name,
  message: "src/lib is shared with the mobile app: no browser globals (see WEB_ONLY_LIB).",
}));

export default defineConfig([
  // Next.js: core web vitals, react, react-hooks (v7, including the React Compiler rules), import, @next/next.
  ...nextVitals,
  ...nextTs,

  // TypeScript: strict + type-checked. The few strict rules that are pure style are tuned below.
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React event props may return promises (React ignores the value); everything else must not.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // Numbers in template literals are fine; objects, null and undefined are not.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Style only: `onClick={() => setOpen(false)}` returns the setter's void.
      "@typescript-eslint/no-confusing-void-expression": "off",
      // `!` marks an invariant the type system cannot see (as `!!` does in the backend).
      "@typescript-eslint/no-non-null-assertion": "off",
      // Sound now that tsconfig has noUncheckedIndexedAccess on: a guard on an indexed read is necessary, one on a value
      // the types say is always present is dead code.
      "@typescript-eslint/no-unnecessary-condition": "error",

      // Size and complexity: split a component into subcomponents and hooks, and pure logic into lib/, rather than
      // suppressing. There are no recorded suppressions.
      complexity: ["error", 20],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],

      // Components must use the API layer (src/lib/api), never raw fetch.
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use the typed API layer in src/lib/api instead of raw fetch." },
      ],

      // Turbopack can't shake zod's re-exported `z` namespace: `import { z }` ships every locale and the JSON
      // Schema tooling (380 KB raw on almost every page), `import * as z` only the schemas we call (106 KB).
      "no-restricted-syntax": ["error", ZOD_NAMESPACE_IMPORT],

      "no-restricted-imports": ["error", { patterns: [NEXT_FONT_GOOGLE] }],
    },
  },

  // Accessibility: the full jsx-a11y recommended set (Next enables only a handful of its rules).
  {
    files: ["**/*.tsx"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Our design-system controls render labelable elements (input, button[role=switch]) inside the label.
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          assert: "either",
          depth: 3,
          controlComponents: ["Input", "NumberInput", "Textarea", "Switch", "Checkbox", "Select"],
        },
      ],
      // `role` on our own components (e.g. a demo user's role) is a prop, not an ARIA role.
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
      // autoFocus on design-system inputs moves focus into a just-opened dialog/sheet/inline editor (the WAI-ARIA
      // dialog pattern); it stays banned on raw DOM elements.
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      // A scroll container (calendar grid, wide tables) is a focusable named region so keyboard users can scroll it
      // (WCAG 2.1.1; axe's scrollable-region-focusable). Other non-interactive elements stay unfocusable.
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "region"], tags: [] }],
    },
  },

  // Module boundaries (docs/engineering.md "Module layout"):
  //   app → anything; feature → ui, lib, shared, its own files, other features' entry points only;
  //   shared (brand, shells, common) → ui, lib, shared, features' entry points; ui → ui, lib; lib → lib.
  // Tests may import anything they need to set up.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true, project: "./tsconfig.json" } },
      "boundaries/include": ["src/app/**", "src/components/**", "src/lib/**", "src/test/**"],
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "ui", pattern: "src/components/ui" },
        { type: "shared", pattern: "src/components/(brand|shells|common)" },
        { type: "feature", pattern: "src/components/*", capture: ["feature"] },
        { type: "lib", pattern: "src/lib" },
        { type: "test-support", pattern: "src/test" },
      ],
      "boundaries/files": [
        { category: "test", pattern: "**/*.test.{ts,tsx}" },
        { category: "test", pattern: "**/__tests__/**" },
        { category: "test", pattern: "src/components/*/test/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            { allow: { to: { module: { origin: "external" } } } },
            { allow: { to: { module: { origin: "core" } } } },
            {
              from: { file: { categories: "test" } },
              allow: { to: { element: { types: { anyOf: ALL_ELEMENTS } } } },
            },
            {
              from: { element: { types: { anyOf: ["app", "test-support"] } } },
              allow: { to: { element: { types: { anyOf: ALL_ELEMENTS } } } },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { element: { types: { anyOf: ["ui", "lib"] } } } },
            },
            { from: { element: { type: "lib" } }, allow: { to: { element: { type: "lib" } } } },
            {
              from: { element: { types: { anyOf: ["shared", "feature"] } } },
              allow: { to: { element: { types: { anyOf: ["ui", "lib", "shared"] } } } },
            },
            ...Object.entries(FEATURE_ENTRY_POINTS).map(([feature, entryPoints]) => ({
              from: { element: { types: { anyOf: ["shared", "feature"] } } },
              allow: {
                to: { element: { type: "feature", captured: { feature }, fileInternalPath: entryPoints } },
              },
            })),
            {
              from: { element: { type: "feature" } },
              allow: {
                to: {
                  element: { type: "feature", captured: { feature: "{{ from.element.captured.feature }}" } },
                },
              },
            },
          ],
        },
      ],
    },
  },

  // Tests: mocks and fixtures are loosely typed by nature.
  {
    files: [
      "**/*.test.{ts,tsx}",
      "**/__tests__/**",
      "src/components/*/test/**",
      "src/test/**",
      "tests/**",
      "vitest.setup.ts",
    ],
    rules: {
      "no-restricted-globals": "off",
      "max-lines": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      // fetch mocks: async without await, String(RequestInfo), spreading window.location into a stub.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-misused-spread": "off",
    },
  },
  // src/lib is platform-agnostic (shared with mobile/) unless listed in WEB_ONLY_LIB.
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    ignores: [...WEB_ONLY_LIB, "src/lib/**/*.test.{ts,tsx}", "src/lib/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            NEXT_FONT_GOOGLE,
            {
              group: WEB_ONLY_PACKAGES,
              message: "src/lib is shared with the mobile app: no web-only packages (see WEB_ONLY_LIB).",
            },
            {
              group: WEB_ONLY_LIB_IMPORTS,
              message: "src/lib is shared with the mobile app: this module is web-only (WEB_ONLY_LIB).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use the typed API layer in src/lib/api instead of raw fetch." },
        ...BROWSER_GLOBALS,
      ],
      "no-restricted-syntax": [
        "error",
        ZOD_NAMESPACE_IMPORT,
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]",
          message: "src/lib is shared with the mobile app: no DOM elements (see WEB_ONLY_LIB).",
        },
      ],
    },
  },
  // The API client is the one place that calls fetch; the server client is web-only.
  {
    files: ["src/lib/api/client.ts"],
    rules: { "no-restricted-globals": ["error", ...BROWSER_GLOBALS] },
  },
  {
    files: ["src/lib/api/server.ts"],
    rules: { "no-restricted-globals": "off" },
  },
  // Next's config callbacks (rewrites, headers) must be async even when they await nothing.
  { files: ["*.config.ts"], rules: { "@typescript-eslint/require-await": "off" } },
  // Plain JS config files are not part of the TypeScript project.
  { files: ["**/*.{js,mjs,cjs}"], extends: [tseslint.configs.disableTypeChecked] },

  // Last: turn off every stylistic rule that Prettier owns.
  prettier,

  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "playwright-report/**",
    "blob-report/**",
    "test-results/**",
    ".claude/**",
  ]),
]);
