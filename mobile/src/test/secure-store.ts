/** An in-memory expo-secure-store for tests (jest.setup.ts). */
const store = new Map<string, string>();

export function resetSecureStore() {
  store.clear();
}

export const secureStoreMock = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => Promise.resolve(void store.set(key, value)),
  deleteItemAsync: (key: string) => Promise.resolve(void store.delete(key)),
};
