// Metro: Expo's defaults, plus the website's shared code (shared-code.js, docs/mobile.md "Shared code").
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { FRONTEND_SRC, isFrontendSource, isPackageRequest, resolveAlias } = require("./shared-code");

const config = getDefaultConfig(__dirname);

// Watch the website's source (not its node_modules) so shared modules bundle and hot-reload.
config.watchFolders = [...(config.watchFolders ?? []), FRONTEND_SRC];

const projectOrigin = path.join(__dirname, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Aliases first: they apply in every file, shared ones included (their own `@/lib/...` imports).
  const aliased = resolveAlias(moduleName);
  if (aliased) return context.resolveRequest(context, aliased, platform);
  // A shared module's packages come from the app's node_modules: one copy of React and TanStack Query.
  if (isFrontendSource(context.originModulePath) && isPackageRequest(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: projectOrigin }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
