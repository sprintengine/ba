/**
 * The website's dev auth session: the dev token (`dev-token.ts`) kept in localStorage. Only works against a backend
 * running AUTH_MODE=dev + APP_ENV=development.
 */
import { encodeDevToken, type DevIdentity } from "./dev-token";

export * from "./dev-token";

export const DEV_STORAGE_KEY = "bookanything.devAuth";
const CHANGE_EVENT = "bookanything:dev-auth";

export function readDevToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEV_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeDevToken(token: string | null) {
  if (token) window.localStorage.setItem(DEV_STORAGE_KEY, token);
  else window.localStorage.removeItem(DEV_STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeDevToken(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === DEV_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function devSignIn(identity: DevIdentity) {
  writeDevToken(encodeDevToken(identity));
}

export function devSignOut() {
  writeDevToken(null);
}
