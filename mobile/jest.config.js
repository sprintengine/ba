// Jest (jest-expo + React Native Testing Library). See README.md "Tests".
const expoPreset = require("jest-expo/jest-preset");
const { _jestMappingFromTypescriptPaths } = require("jest-expo/src/preset/withTypescriptMapping");
const { compilerOptions } = require("./tsconfig.json");

// jest-expo turns tsconfig `paths` into moduleNameMapper entries; ours are for tsc (shared modules' package types)
// and would send `react` to @types/react. jest-resolver.js resolves the aliases instead.
const fromTsconfig = new Set(Object.keys(_jestMappingFromTypescriptPaths(compilerOptions.paths)));
const moduleNameMapper = {
  ...Object.fromEntries(
    Object.entries(expoPreset.moduleNameMapper).filter(([key]) => !fromTsconfig.has(key)),
  ),
  // Its React Native entry is untranspiled .mjs; the CommonJS build is the same icons.
  "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
};

/** Packages shipped as untranspiled ESM/TS/JSX that Jest must run through Babel. */
const TRANSPILE = [
  ".pnpm",
  "react-native",
  "@react-native",
  "@react-native-community",
  "expo",
  "@expo",
  "expo-.*",
  "@expo-google-fonts",
  "react-navigation",
  "@react-navigation",
  "@shopify/flash-list",
  "lucide-react-native",
  "react-native-svg",
  "react-native-mmkv",
  "react-native-nitro-modules",
  "@clerk",
  "standard-navigation",
];

module.exports = {
  ...expoPreset,
  moduleNameMapper,
  resolver: "<rootDir>/jest-resolver.js",
  transformIgnorePatterns: [`/node_modules/(?!(${TRANSPILE.join("|")}))`],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/{app,src}/**/*.test.{ts,tsx}", "<rootDir>/scripts/**/*.test.{js,mjs,ts}"],
  // Whole-app tests compile the router and every screen on first use; CI runners are slower than a laptop.
  testTimeout: 15_000,
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/ios/", "/android/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/test/**",
    "!**/*.d.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "json-summary"],
  // Measured with every feature (lines 92.5, statements 90.9, functions 85.6, branches 84.7) minus ~3 points.
  // Raise as features land; never lower to get a build through.
  coverageThreshold: { global: { lines: 89, statements: 88, functions: 82, branches: 81 } },
};
