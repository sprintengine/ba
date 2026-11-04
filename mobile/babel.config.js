// Expo's preset (React Compiler on via app.config.ts `experiments.reactCompiler`). It also compiles the website's
// shared modules (shared-code.js): this is a project-wide config, so it applies outside mobile/ too.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Jest runs CommonJS without Node's VM modules, so `import()` (Metro splits it; the shared assistant API loads its
    // schemas that way) becomes a require there.
    plugins: process.env.NODE_ENV === "test" ? [dynamicImportToRequire] : [],
  };
};

/** `import(x)` → `Promise.resolve().then(() => require(x))`, for tests only. */
function dynamicImportToRequire({ types: t }) {
  return {
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== "Import") return;
        const resolved = t.callExpression(
          t.memberExpression(t.identifier("Promise"), t.identifier("resolve")),
          [],
        );
        const load = t.arrowFunctionExpression(
          [],
          t.callExpression(t.identifier("require"), path.node.arguments),
        );
        path.replaceWith(t.callExpression(t.memberExpression(resolved, t.identifier("then")), [load]));
      },
    },
  };
}
