// Jest's counterpart of metro.config.js: the shared-code aliases, and a shared module's packages from mobile/.
const path = require("node:path");
const reactNativeResolver = require("@react-native/jest-preset/jest/resolver");
const { MOBILE_ROOT, isFrontendSource, isPackageRequest, resolveAlias } = require("./shared-code");

module.exports = (request, options) => {
  const aliased = resolveAlias(request);
  if (aliased) return reactNativeResolver(aliased, options);
  if (isFrontendSource(path.join(options.basedir, "_")) && isPackageRequest(request)) {
    return reactNativeResolver(request, { ...options, basedir: MOBILE_ROOT });
  }
  return reactNativeResolver(request, options);
};
