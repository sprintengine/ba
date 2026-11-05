/**
 * Expo app config (docs/mobile.md "Build variants"). One file, three variants chosen by `APP_VARIANT`:
 *
 * - `development` (default for local runs): a dev client, `ie.bookanything.app.dev`, talks to the local backend.
 * - `preview`: internal builds (TestFlight / internal track) against staging.
 * - `production`: the store app.
 *
 * Each variant has its own bundle id and URL scheme, so all three install side by side and a link opens the right
 * one. Public build-time settings come from the environment (EAS environment variables on EAS, `mobile/.env.local`
 * locally; see `.env.example`). Nothing secret belongs here: everything in `extra` ships inside the app.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";
import { withInfoPlist, type ConfigPlugin } from "expo/config-plugins";

type Variant = "development" | "preview" | "production";

type VariantConfig = {
  name: string;
  bundleId: string;
  scheme: string;
  /** Website origin: universal links, pages we open in the browser (site builder, Stripe), MCP URLs. */
  webUrl: string;
  /** The domains whose https links open the app (Associated Domains / Android App Links). */
  linkDomains: string[];
};

const VARIANTS: Record<Variant, VariantConfig> = {
  development: {
    name: "bookanything Dev",
    bundleId: "ie.bookanything.app.dev",
    scheme: "bookanything-dev",
    // Empty: the app derives http://<Metro host>:3000 at runtime (src/config/env.ts).
    webUrl: "",
    linkDomains: [],
  },
  preview: {
    name: "bookanything Preview",
    bundleId: "ie.bookanything.app.preview",
    scheme: "bookanything-preview",
    webUrl: "https://staging.bookanything.ie",
    linkDomains: ["staging.bookanything.ie"],
  },
  production: {
    name: "bookanything",
    bundleId: "ie.bookanything.app",
    scheme: "bookanything",
    webUrl: "https://bookanything.ie",
    linkDomains: ["bookanything.ie", "www.bookanything.ie"],
  },
};

/** Website paths the app handles (mirrors the app's routes; architecture §11). Everything else stays in the browser. */
const APP_LINK_PATHS = ["/my", "/dashboard", "/manage", "/invitations", "/explore"];
/** Android pattern for a business's booking flow (`/{slug}/book`); the AASA has the same as `/*\/book`. */
const APP_BOOK_PATTERN = "/.*/book";

function variantFromEnv(): Variant {
  const value = process.env.APP_VARIANT ?? "development";
  if (value === "development" || value === "preview" || value === "production") return value;
  throw new Error(`APP_VARIANT must be development, preview or production (got "${value}")`);
}

/**
 * Sentry's build steps (upload source maps and native debug symbols; docs/mobile.md "Errors and crash reporting")
 * only when the build can authenticate: without `SENTRY_AUTH_TOKEN` they would fail it. The SDK is linked either way
 * and runs only with a DSN. Org and project come from `SENTRY_ORG` and `SENTRY_PROJECT` in the build's environment.
 */
const sentryBuildPlugin = (): string[] =>
  process.env.SENTRY_AUTH_TOKEN ? ["@sentry/react-native/expo"] : [];

/** Store builds: drop the dev launcher's local-network purpose string (the launcher isn't in release builds). */
const withoutDevLauncherStrings: ConfigPlugin = (config) =>
  withInfoPlist(config, (c) => {
    delete c.modResults.NSLocalNetworkUsageDescription;
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = variantFromEnv();
  const v = VARIANTS[variant];
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? v.webUrl;

  const appConfig: ExpoConfig = {
    ...config,
    name: v.name,
    slug: "bookanything",
    owner: process.env.EXPO_OWNER,
    version: "0.1.0",
    scheme: v.scheme,
    orientation: "default",
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "automatic",
    backgroundColor: "#f6f7f9",
    ios: {
      bundleIdentifier: v.bundleId,
      supportsTablet: true,
      // Paid team (CODEOWNER's Apple Developer account). Local `expo run:ios --device` signs with it.
      appleTeamId: process.env.APPLE_TEAM_ID ?? "V266333BR2",
      associatedDomains: v.linkDomains.map((domain) => `applinks:${domain}`),
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        // Development only: the dev client talks to the Mac's backend over plain http on the LAN.
        ...(variant === "development" ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      package: v.bundleId,
      adaptiveIcon: { foregroundImage: "./assets/images/adaptive-icon.png", backgroundColor: "#1a1c20" },
      predictiveBackGestureEnabled: true,
      // Development only: plain http to the Mac's backend.
      ...(variant === "development" ? { usesCleartextTraffic: true } : {}),
      intentFilters: v.linkDomains.length
        ? [
            {
              action: "VIEW",
              autoVerify: true,
              category: ["BROWSABLE", "DEFAULT"],
              data: v.linkDomains.flatMap((host) => [
                ...APP_LINK_PATHS.map((pathPrefix) => ({ scheme: "https", host, pathPrefix })),
                // A business's booking flow (`/lumen-physio/book`); its other pages stay on the website.
                { scheme: "https", host, pathPattern: APP_BOOK_PATTERN },
              ]),
            },
          ]
        : [],
    },
    web: { output: "static", favicon: "./assets/images/icon.png" },
    plugins: [
      ["expo-router", { origin: webUrl || undefined }],
      // Keychain without Face ID: drop the plugin's default Face ID purpose string.
      ["expo-secure-store", { faceIDPermission: false }],
      "@clerk/expo",
      "expo-web-browser",
      "expo-image",
      "expo-localization",
      // Bo's dictation (src/features/assistant/dictation): Apple's or Google's recogniser, on the device where it can.
      [
        "expo-speech-recognition",
        {
          microphonePermission:
            "bookanything uses the microphone only while you dictate a message to Bo. Audio isn't recorded or stored.",
          speechRecognitionPermission:
            "bookanything turns what you say to Bo into text, on your device where it can. Nothing is sent until you press Send.",
          androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
        },
      ],
      // Push notifications (src/features/notifications/push): APNs via EAS credentials, FCM on Android (docs/mobile.md).
      [
        "expo-notifications",
        {
          // Android's status bar and notification icon: white on transparent (the symbol), tinted `color`.
          icon: "./assets/images/notification-icon.png",
          color: "#5b4ae0",
          defaultChannel: "default",
          mode: variant === "development" ? "development" : "production",
        },
      ],
      // Explore's "Near me": the position once, while the app is open (never in the background).
      [
        "expo-location",
        {
          locationWhenInUsePermission: "bookanything uses your location to show businesses near you.",
          locationAlwaysAndWhenInUsePermission: false,
          locationAlwaysPermission: false,
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          // No motion activity: drop the plugin's default NSMotionUsageDescription.
          motionUsagePermission: false,
        },
      ],
      // "Add to calendar" opens the system's new-event screen (no calendar access needed on iOS 17+).
      [
        "expo-calendar",
        {
          calendarPermission: "bookanything adds your bookings to your calendar when you ask it to.",
          remindersPermission: false,
        },
      ],
      // Date and time fields (opening hours, time off, deals, reports): the platform's own pickers.
      "@react-native-community/datetimepicker",
      // Logo and cover uploads (Settings › Branding): the system photo picker, no camera.
      [
        "expo-image-picker",
        {
          photosPermission: "Choose a logo or cover photo for your business from your photo library.",
          cameraPermission: false,
          // Not `microphonePermission: false`: that removes the microphone app-wide, and Bo's dictation needs it.
        },
      ],
      [
        "expo-font",
        {
          fonts: [
            "./assets/fonts/Figtree-Regular.ttf",
            "./assets/fonts/Figtree-Medium.ttf",
            "./assets/fonts/Figtree-SemiBold.ttf",
            "./assets/fonts/Figtree-Bold.ttf",
          ],
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 120,
          resizeMode: "contain",
          backgroundColor: "#f6f7f9",
          dark: { image: "./assets/images/splash-icon.png", backgroundColor: "#0c0d0f" },
        },
      ],
      ...sentryBuildPlugin(),
    ],
    // tsconfigPaths off: metro.config.js resolves the aliases (shared-code.js); tsconfig's package paths are for tsc only.
    experiments: { typedRoutes: true, reactCompiler: true, tsconfigPaths: false },
    extra: {
      variant,
      /** API origin; empty in development, where the app uses http://<Metro host>:8080 (src/config/env.ts). */
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
      webUrl,
      /** Clerk publishable key (public by design). Without one, the app uses dev auth (development only). */
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      /** Sentry DSN (public by design). Without one, nothing is reported (src/lib/error-reporting.ts). */
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
      /** Overrides the variant's Sentry environment (development, staging, production). */
      sentryEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? "",
      router: {},
      eas: { projectId: process.env.EAS_PROJECT_ID },
    },
  };
  return variant === "development" ? appConfig : withoutDevLauncherStrings(appConfig);
};
