/**
 * The details form survives leaving the booking flow and coming back to the same business while the app runs (the
 * website keeps them in sessionStorage), so going back to change something doesn't mean retyping. In memory only,
 * never written to disk, never sensitive answers (`storableDetails`), and forgotten on sign-out (and account
 * deletion), so the next person's form starts from their own account.
 */
import {
  EMPTY_DETAILS,
  storableDetails,
  type DetailsValues,
  type Question,
} from "@shared/booking/details-schema";
import { beforeSignOut } from "~/auth/before-sign-out";

const saved = new Map<string, DetailsValues>();

beforeSignOut(async () => resetDetailsMemory());

export function loadDetails(slug: string): DetailsValues | null {
  const values = saved.get(slug);
  return values ? { ...EMPTY_DETAILS, ...values, answers: { ...values.answers } } : null;
}

export function saveDetails(slug: string, values: Partial<DetailsValues>, questions: Question[]): void {
  saved.set(
    slug,
    storableDetails({ ...EMPTY_DETAILS, ...values, answers: { ...values.answers } }, questions),
  );
}

export function clearDetails(slug: string): void {
  saved.delete(slug);
}

/** Forgets every business's details (on sign-out; tests start clean). */
export function resetDetailsMemory(): void {
  saved.clear();
}
