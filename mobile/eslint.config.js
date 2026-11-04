// ESLint (flat config): Expo's rules (React, hooks incl. the React Compiler rules, TypeScript, imports) plus the
// app's conventions. Prettier owns formatting.
const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettier = require("eslint-config-prettier/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text", "Button", "TextInput", "Switch"],
              message:
                "Use the design system in ~/ui (Text, Button, TextField, Switch): tokens, Dynamic Type, a11y.",
            },
          ],
          patterns: [
            {
              group: ["@/*"],
              message: 'Import the website\'s shared code as @shared/… (docs/mobile.md "Shared code").',
            },
            {
              group: ["../frontend/*", "../../frontend/*", "../../../frontend/*"],
              message: "Import the website's shared code as @shared/….",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use the shared API layer (@shared/api hooks) instead of raw fetch." },
      ],
      "react/no-unescaped-entities": "off",
    },
  },
  // The design system wraps the React Native primitives it replaces.
  {
    files: ["src/ui/**"],
    rules: { "no-restricted-imports": "off" },
  },
  // Tests and test helpers stub fetch, render raw primitives and reach fixtures.
  {
    files: ["**/*.test.{ts,tsx,js}", "src/test/**", "jest.setup.ts"],
    rules: { "no-restricted-imports": "off", "no-restricted-globals": "off" },
  },
  // Node scripts and config (CommonJS), and their Jest tests.
  {
    files: ["*.js", "scripts/**/*.{js,mjs}"],
    languageOptions: { globals: { ...require("globals").node, ...require("globals").jest } },
  },
  prettier,
  globalIgnores([
    "node_modules/**",
    ".expo/**",
    "ios/**",
    "android/**",
    "dist/**",
    "coverage/**",
    "expo-env.d.ts",
  ]),
]);
