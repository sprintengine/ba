/**
 * The dev auth session on the device: the dev bearer token (`@shared/auth/dev-token`, architecture §3.2) in the
 * Keychain. Only a backend running AUTH_MODE=dev in development accepts it.
 */
import { encodeDevToken, type DevIdentity } from "@shared/auth/dev-token";
import { secureStore } from "~/lib/storage";

const KEY = "bookanything.devAuth";
const listeners = new Set<() => void>();
/** In memory after the first Keychain read; undefined = not read yet. */
let current: string | null | undefined;

export function readDevToken(): string | null {
  if (current === undefined) {
    try {
      current = secureStore.get(KEY);
    } catch {
      current = null;
    }
  }
  return current;
}

function update(token: string | null) {
  current = token;
  listeners.forEach((listener) => listener());
}

export function devSignIn(identity: DevIdentity) {
  const token = encodeDevToken(identity);
  secureStore.set(KEY, token);
  update(token);
}

export async function devSignOut() {
  update(null);
  await secureStore.remove(KEY);
}

export function subscribeDevToken(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: forget the in-memory token (the Keychain mock is cleared separately). */
export function resetDevSessionForTests() {
  current = undefined;
}
