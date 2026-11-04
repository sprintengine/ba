/**
 * @jest-environment node
 */
const path = require("node:path");

describe("metro.config.js", () => {
  const config = require("../metro.config");
  const context = {
    originModulePath: path.join(__dirname, "..", "app", "_layout.tsx"),
    resolveRequest: (_context, name) => ({ type: "sourceFile", filePath: name }),
  };
  const resolve = (name) => config.resolver.resolveRequest(context, name, "ios");

  it("resolves the app's aliases, then hands on to Sentry's resolver", () => {
    expect(resolve("~/lib/logger").filePath).toBe(path.join(__dirname, "..", "src", "lib", "logger"));
    expect(resolve("react")).toEqual({ type: "sourceFile", filePath: "react" });
  });

  it("leaves session replay out of the bundle", () => {
    expect(resolve("@sentry-internal/replay")).toEqual({ type: "empty" });
  });

  it("adds debug ids to the bundle for source maps", () => {
    expect(config.serializer.customSerializer).toEqual(expect.any(Function));
  });
});
