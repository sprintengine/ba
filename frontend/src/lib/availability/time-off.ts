/**
 * Time off, extra hours and closures (availability overrides): the kind of an override, and the add dialog's zod
 * schema and values → `AvailabilityOverrideInput`. Kept free of React so it can be unit-tested.
 */
import * as z from "zod";
import type { AvailabilityOverride, AvailabilityOverrideInput } from "@/lib/api/types";
import { rangeError } from "./windows";

/** A whole day off, part of a day off, or extra hours. */
export type OverrideKind = "off" | "partial" | "extra";

export const OVERRIDE_KIND_LABEL: Record<OverrideKind, string> = {
  off: "Day off",
  partial: "Part of the day",
  extra: "Extra hours",
};

export function overrideKind(o: Pick<AvailabilityOverride, "isAvailable" | "startTime">): OverrideKind {
  if (o.isAvailable) return "extra";
  return o.startTime ? "partial" : "off";
}

/** The backend's limit on the note (`validateOverride` in availability/AvailabilityValidation.kt). */
export const MAX_REASON_LENGTH = 200;

export const timeOffSchema = z
  .object({
    date: z.string().nullable(),
    kind: z.enum(["off", "partial", "extra"]),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    reason: z.string().max(MAX_REASON_LENGTH, `Keep it under ${MAX_REASON_LENGTH} characters`),
  })
  .superRefine((v, ctx) => {
    if (!v.date) ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a date" });
    if (v.kind === "off") return;
    if (!v.startTime || !v.endTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Enter both times" });
      return;
    }
    const problem = rangeError(v.startTime, v.endTime);
    if (problem) ctx.addIssue({ code: "custom", path: ["endTime"], message: problem });
  });

export type TimeOffValues = z.infer<typeof timeOffSchema>;

/** A new entry: a day off today; the times are kept ready for "Part of the day". */
export const timeOffDefaults = (today: string): TimeOffValues => ({
  date: today,
  kind: "off",
  startTime: "09:00",
  endTime: "13:00",
  reason: "",
});

/** The live problem with the times (shown as they change), or null; none for a whole day off. */
export function timeOffTimeError(v: Pick<TimeOffValues, "kind" | "startTime" | "endTime">): string | null {
  if (v.kind === "off" || !v.startTime || !v.endTime) return null;
  return rangeError(v.startTime, v.endTime);
}

/** Whether Save can be pressed: a date, and for timed kinds both times in order. */
export function timeOffReady(v: TimeOffValues): boolean {
  if (!v.date) return false;
  if (v.kind === "off") return true;
  return !!v.startTime && !!v.endTime && !timeOffTimeError(v);
}

export function timeOffToInput(v: TimeOffValues & { date: string }): AvailabilityOverrideInput {
  const timed = v.kind !== "off";
  return {
    date: v.date,
    isAvailable: v.kind === "extra",
    startTime: timed ? v.startTime : null,
    endTime: timed ? v.endTime : null,
    reason: v.reason.trim() || null,
  };
}
