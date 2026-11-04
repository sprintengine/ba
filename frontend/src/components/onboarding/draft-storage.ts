/**
 * Keeps the in-progress onboarding in sessionStorage so a refresh doesn't lose edits.
 * Per-tab on purpose: two tabs can draft two businesses without clobbering each other.
 */
import type { SetupDraft } from "@/lib/onboarding/types";

const KEY = "bookanything.onboarding.v1";

export type DraftOrigin = { kind: "ai" } | { kind: "template"; key: string };

export type CreatedBusiness = {
  id: string;
  slug: string;
  name: string;
  primaryColor: string;
  hasPaidServices: boolean;
};

export type SavedOnboarding =
  | { step: "review"; draft: SetupDraft; origin: DraftOrigin }
  | { step: "site"; business: CreatedBusiness }
  | { step: "success"; business: CreatedBusiness };

/** Session storage outlives deploys: only a saved value with the shape this version writes is restored. */
function isSavedOnboarding(value: unknown): value is SavedOnboarding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as {
    step?: unknown;
    draft?: { setup?: unknown } | null;
    business?: { id?: unknown } | null;
  };
  if (v.step === "review") return !!v.draft?.setup;
  return (v.step === "site" || v.step === "success") && !!v.business?.id;
}

export function loadOnboarding(): SavedOnboarding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedOnboarding(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOnboarding(value: SavedOnboarding) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage full or disabled: persistence is a nicety, never an error.
  }
}

export function clearOnboarding() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
