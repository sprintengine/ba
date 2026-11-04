/**
 * How the mobile app reads the website's platform-agnostic code (docs/mobile.md "Shared code"). One definition for
 * Metro (metro.config.js) and Jest (jest.config.js); tsconfig.json mirrors the aliases in `paths`.
 *
 * - `@shared/<path>` is `frontend/src/lib/<path>`: the API client, types, query keys and hooks, formatting,
 *   vocabulary, validation, booking rules… Only modules the website keeps platform-agnostic (frontend
 *   eslint.config.mjs `WEB_ONLY_LIB`) may be imported; `src/shared/boundary.test.ts` checks the whole import graph.
 * - `@/<path>` is `frontend/src/<path>`, for the shared modules' own imports. Mobile code never uses it.
 * - `~/<path>` is `mobile/src/<path>`, the app's own code.
 * - A package imported by a shared module resolves from `mobile/node_modules`, never `frontend/node_modules`: one
 *   React, one TanStack Query, and CI needs no frontend install.
 */
const path = require("node:path");

const MOBILE_ROOT = __dirname;
const FRONTEND_SRC = path.resolve(MOBILE_ROOT, "../frontend/src");
const SHARED_ROOT = path.join(FRONTEND_SRC, "lib");

const ALIASES = [
  { prefix: "@shared/", target: SHARED_ROOT },
  { prefix: "@/", target: FRONTEND_SRC },
  { prefix: "~/", target: path.join(MOBILE_ROOT, "src") },
];

/** The file an aliased specifier points at (without extension), or null when `request` is not aliased. */
function resolveAlias(request) {
  for (const { prefix, target } of ALIASES) {
    if (request.startsWith(prefix)) return path.join(target, request.slice(prefix.length));
  }
  return null;
}

/** Whether `file` is website source that the app compiles (shared code). */
function isFrontendSource(file) {
  return file.startsWith(FRONTEND_SRC + path.sep);
}

/** A bare package specifier (`react`, `@tanstack/react-query`), as opposed to a relative, absolute or aliased one. */
function isPackageRequest(request) {
  return !request.startsWith(".") && !path.isAbsolute(request) && resolveAlias(request) === null;
}

module.exports = { MOBILE_ROOT, FRONTEND_SRC, SHARED_ROOT, resolveAlias, isFrontendSource, isPackageRequest };
