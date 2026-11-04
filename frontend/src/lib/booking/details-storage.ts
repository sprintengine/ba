/**
 * The booking details form survives a refresh within the browser session (sessionStorage, per business), so a
 * customer who goes back to change the time doesn't retype everything. Sensitive answers are never stored.
 * Storage errors (disabled, full, corrupt) are ignored: saving is a convenience.
 */
import { EMPTY_DETAILS, storableDetails, type DetailsValues, type Question } from "./details-schema";

const storageKey = (slug: string) => `bookanything.booking-details.${slug}`;

/** Details saved earlier this session, over empty defaults; null when there are none (or they're unreadable). */
export function loadSavedDetails(slug: string): DetailsValues | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    return { ...EMPTY_DETAILS, ...(JSON.parse(raw) as Partial<DetailsValues>) };
  } catch {
    return null;
  }
}

/** Saves the form's current values, without the answers to any of [questions] that are sensitive. */
export function saveDetails(slug: string, values: Partial<DetailsValues>, questions: Question[]): void {
  try {
    sessionStorage.setItem(
      storageKey(slug),
      JSON.stringify(storableDetails({ ...EMPTY_DETAILS, ...values }, questions)),
    );
  } catch {
    /* storage full or disabled */
  }
}

/** Forgets the saved details (after booking). */
export function clearSavedDetails(slug: string): void {
  try {
    sessionStorage.removeItem(storageKey(slug));
  } catch {
    /* ignore */
  }
}
