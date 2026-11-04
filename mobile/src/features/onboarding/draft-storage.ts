/**
 * Keeps the draft being reviewed on the device, so leaving the wizard (or the app being closed) doesn't lose the
 * owner's edits: the website's draft-storage (sessionStorage) on MMKV. It goes in the encrypted store (staff names,
 * prices), tagged with the user it belongs to, so someone else signing in on the phone never sees it.
 */
import type { SetupDraft } from "@shared/onboarding/types";
import { cacheStore } from "~/lib/storage";
import { logError } from "~/lib/logger";
import type { DraftOrigin } from "./wizard";

const KEY = "onboarding.draft.v1";

export type SavedDraft = { draft: SetupDraft; origin: DraftOrigin };
type Stored = SavedDraft & { userId: string };

/** Storage outlives app versions: only a value with the shape this version writes is restored. */
function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Stored>;
  return (
    typeof v.userId === "string" &&
    typeof v.draft?.setup === "object" &&
    Array.isArray(v.draft.setup.services) &&
    Array.isArray(v.draft.setup.resources) &&
    (v.origin?.kind === "ai" || v.origin?.kind === "template")
  );
}

/** The draft [userId] left, or null. */
export function loadDraft(userId: string | null | undefined): SavedDraft | null {
  if (!userId) return null;
  try {
    const raw = cacheStore().getString(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isStored(value) || value.userId !== userId) return null;
    return { draft: value.draft, origin: value.origin };
  } catch (error) {
    logError(error, { area: "onboarding.loadDraft" });
    return null;
  }
}

export function saveDraft(userId: string | null | undefined, saved: SavedDraft) {
  if (!userId) return;
  try {
    cacheStore().set(KEY, JSON.stringify({ ...saved, userId } satisfies Stored));
  } catch (error) {
    logError(error, { area: "onboarding.saveDraft" });
  }
}

export function clearDraft() {
  try {
    cacheStore().remove(KEY);
  } catch (error) {
    logError(error, { area: "onboarding.clearDraft" });
  }
}
