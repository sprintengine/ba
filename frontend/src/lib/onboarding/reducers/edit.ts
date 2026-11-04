/** Immutable edit helpers shared by the setup reducers. */
import type { BusinessSetup } from "@/lib/api/types";
import { sortHours } from "../hours";
import type { SetupDraft, SetupService, SetupWeeklyHours } from "../types";

export function mapAt<T>(list: T[], index: number, fn: (item: T) => T): T[] {
  return list.map((item, i) => (i === index ? fn(item) : item));
}

export function without<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function withSetup(draft: SetupDraft, fn: (s: BusinessSetup) => BusinessSetup): SetupDraft {
  return { ...draft, setup: fn(draft.setup) };
}

export function mapService(
  draft: SetupDraft,
  index: number,
  fn: (s: SetupService) => SetupService,
): SetupDraft {
  return withSetup(draft, (s) => ({ ...s, services: mapAt(s.services, index, fn) }));
}

/** Edits one resource's weekly hours (kept sorted). */
export function mapResourceHours(
  draft: SetupDraft,
  key: string,
  fn: (hours: SetupWeeklyHours[]) => SetupWeeklyHours[],
): SetupDraft {
  return withSetup(draft, (s) => ({
    ...s,
    resources: s.resources.map((r) =>
      r.key === key ? { ...r, weeklyHours: sortHours(fn(r.weeklyHours)) } : r,
    ),
  }));
}
