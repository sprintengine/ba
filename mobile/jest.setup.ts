/**
 * Test environment (README.md "Tests"): in-memory Keychain, network always online, FlashList with a fixed layout,
 * the API client pointed at http://api.test (stub it with `mockApi`, src/test/api-mock.ts).
 */
import { configureApiClient } from "@shared/api/client";
import { resetDevSessionForTests } from "~/auth/dev-session";
import { cacheStore, prefs } from "~/lib/storage";
import { resetSecureStore } from "~/test/secure-store";

// FlashList measures its layout natively; give it a phone-sized window. (Its own jestSetup.js also swaps FlashList
// for a RecyclerView export that 2.0.x no longer has.)
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    "@shopify/flash-list/dist/recyclerview/utils/measureLayout",
  );
  const box = (width: number, height: number) => () => ({ x: 0, y: 0, width, height });
  return {
    ...actual,
    measureParentSize: jest.fn(box(390, 844)),
    measureFirstChildLayout: jest.fn(box(390, 844)),
    measureItemLayout: jest.fn(box(390, 140)),
  };
});

// No garbage-collection timers (the app keeps unused data for 24 hours) or retries in tests: the run ends when the
// tests do, and a failure shows at once.
jest.mock("~/api/query-client", () => {
  const actual = jest.requireActual<typeof import("~/api/query-client")>("~/api/query-client");
  return {
    ...actual,
    createQueryClient: () => {
      const client = actual.createQueryClient();
      const defaults = client.getDefaultOptions();
      client.setDefaultOptions({
        ...defaults,
        queries: { ...defaults.queries, gcTime: Infinity, retry: false },
      });
      return client;
    },
  };
});

jest.mock(
  "expo-secure-store",
  () => jest.requireActual<typeof import("~/test/secure-store")>("~/test/secure-store").secureStoreMock,
);

// MMKV's own in-memory mock, without loading its native (Nitro) module.
jest.mock("react-native-mmkv", () => {
  const { createMockMMKV } = jest.requireActual<
    typeof import("react-native-mmkv/lib/createMMKV/createMockMMKV")
  >("react-native-mmkv/lib/createMMKV/createMockMMKV");
  return { createMMKV: createMockMMKV };
});

jest.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: () => undefined }),
  getNetworkStateAsync: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
}));

// Streamed responses (Bo's server-sent events) are Node's web streams in tests; Expo's TextDecoderStream polyfill
// belongs to another ReadableStream class, which Node's pipeThrough refuses.
globalThis.TextDecoderStream = jest.requireActual<{ TextDecoderStream: typeof TextDecoderStream }>(
  "node:stream/web",
).TextDecoderStream;

// The app's streaming fetch (src/api/setup.ts) is native; in tests it is the global fetch that `mockApi` stubs.
jest.mock("expo/fetch", () => ({
  fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

// Push notifications: permission not asked yet, no token (no EAS project), nothing tapped. Tests override per case
// (src/features/notifications/push/*.test.tsx).
jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 2 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "undetermined", canAskAgain: true, granted: false }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "granted", canAskAgain: true, granted: true }),
  ),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ type: "expo", data: "ExponentPushToken[test]" })),
  unregisterForNotificationsAsync: jest.fn(() => Promise.resolve()),
  setBadgeCountAsync: jest.fn(() => Promise.resolve(true)),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  useLastNotificationResponse: jest.fn(() => undefined),
  clearLastNotificationResponse: jest.fn(),
}));

// Sentry's SDK talks to its native module; tests only see what the app hands it (src/lib/error-reporting.test.ts).
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(() => "event-id"),
  setUser: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: "opened" })),
  // Stripe Checkout and other authentication sessions: closed by the person unless a test says otherwise.
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
  dismissBrowser: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

beforeEach(() => {
  configureApiClient({ baseUrl: "http://api.test", fetch: null, getToken: null });
});

afterEach(() => {
  resetSecureStore();
  resetDevSessionForTests();
  prefs().clearAll();
  cacheStore().clearAll();
  jest.restoreAllMocks();
});
