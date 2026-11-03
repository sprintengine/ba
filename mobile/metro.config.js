// Metro: Expo's defaults, plus the website's shared code (shared-code.js, docs/mobile.md "Shared code").
const path = require("node:path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { FRONTEND_SRC, isFrontendSource, isPackageRequest, resolveAlias } = require("./shared-code");

// Expo's default config with debug ids in the bundle and its source maps, so Sentry matches a crash to its map.
// No session replay anywhere, so its web package resolves to nothing.
const config = getSentryExpoConfig(__dirname, { includeWebReplay: false });
// Sentry's resolver (it drops the replay package); ours runs first and hands every request on to it.
const resolve = config.resolver.resolveRequest;

// Watch the website's source (not its node_modules) so shared modules bundle and hot-reload.
config.watchFolders = [...(config.watchFolders ?? []), FRONTEND_SRC];

const projectOrigin = path.join(__dirname, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Aliases first: they apply in every file, shared ones included (their own `@/lib/...` imports).
  const aliased = resolveAlias(moduleName);
  if (aliased) return resolve(context, aliased, platform);
  // A shared module's packages come from the app's node_modules: one copy of React and TanStack Query.
  if (isFrontendSource(context.originModulePath) && isPackageRequest(moduleName)) {
    return resolve({ ...context, originModulePath: projectOrigin }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
