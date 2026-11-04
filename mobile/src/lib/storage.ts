/**
 * Device storage (docs/mobile.md "Data layer"):
 *
 * - `prefs`: small, non-sensitive settings (last business opened, UI choices). Plain MMKV.
 * - `cache`: the persisted React Query cache, which holds people's bookings and customers' details. MMKV encrypted with
 *   a random key kept in the Keychain / Keystore, so a copied app container doesn't reveal it.
 * - Secrets (tokens) never go in MMKV: use `secureStore` (expo-secure-store).
 *
 * MMKV is synchronous, which is what makes a cold start render cached data on the first frame.
 */
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV, type MMKV } from "react-native-mmkv";

/** Keychain items readable after the first unlock, so background work (push, refresh) can read them too. */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** expo-secure-store with the app's Keychain options. Values are strings; keys are `bookanything.*`. */
export const secureStore = {
  get: (key: string): string | null => SecureStore.getItem(key, SECURE_OPTIONS),
  set: (key: string, value: string) => SecureStore.setItem(key, value, SECURE_OPTIONS),
  remove: (key: string) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS),
};

const CACHE_KEY_ITEM = "bookanything.cacheKey";

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** The cache's AES-128 key (16 characters), created on first launch. */
function cacheEncryptionKey(): string {
  const existing = secureStore.get(CACHE_KEY_ITEM);
  if (existing) return existing;
  const key = base64(getRandomBytes(12)); // 12 bytes → 16 base64 characters
  secureStore.set(CACHE_KEY_ITEM, key);
  return key;
}

let prefsInstance: MMKV | null = null;
let cacheInstance: MMKV | null = null;

/** Non-sensitive preferences. */
export function prefs(): MMKV {
  return (prefsInstance ??= createMMKV({ id: "bookanything.prefs" }));
}

/** The encrypted query cache store. */
export function cacheStore(): MMKV {
  return (cacheInstance ??= createMMKV({ id: "bookanything.cache", encryptionKey: cacheEncryptionKey() }));
}

/** Preference keys, in one place so features don't collide. */
export const PREF = {
  /** Slug of the business last opened, to reopen it on launch. */
  lastBusiness: "lastBusiness",
  /** "customer" | "business": the experience last used by someone who has both. */
  lastExperience: "lastExperience",
} as const;
