/**
 * Release schedule editor model (§21): the form schema, conversions to and from the API, and API error paths. No
 * React. Rules mirror the backend (ReleaseValidation.kt).
 */
import * as z from "zod";
import type { ReleaseSchedule, ReleaseScheduleInput } from "@/lib/api/types";

export const MAX_SCHEDULE_SERVICES = 50;
export const MAX_SCHEDULE_GROUPS = 20;
export const MAX_DAYS_BEFORE = 14;
export const MAX_WEEKS_AHEAD = 4;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleFormSchema = z
  .object({
    name: z.string().trim().min(1, "Give the schedule a name").max(80, "Keep it under 80 characters"),
    serviceIds: z
      .array(z.string())
      .min(1, "Choose at least one service")
      .max(MAX_SCHEDULE_SERVICES, `At most ${MAX_SCHEDULE_SERVICES} services`),
    everyone: z.boolean(),
    groupIds: z.array(z.string()).max(MAX_SCHEDULE_GROUPS, `At most ${MAX_SCHEDULE_GROUPS} groups`),
    cadence: z.enum(["daily", "weekly"]),
    time: z.string().nullable(),
    daysBefore: z.number().int().min(0).max(MAX_DAYS_BEFORE),
    weekdaysOnly: z.boolean(),
    weekday: z.number().int().min(1).max(7),
    weeksAhead: z.number().int().min(1).max(MAX_WEEKS_AHEAD),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.time || !TIME_RE.test(v.time)) {
      ctx.addIssue({ code: "custom", path: ["time"], message: "Enter a time like 17:00" });
    }
    if (!v.everyone && v.groupIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["groupIds"], message: "Choose at least one group, or everyone" });
    }
  });

/**
 * Form values: both cadences' settings are kept while the other is chosen, so switching back doesn't lose them;
 * `formToInput` sends only the chosen one's.
 */
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

/** A new schedule: everyone, the day before at 17:00, on the given services. */
export function defaultScheduleForm(serviceIds: string[] = []): ScheduleFormValues {
  return {
    name: "",
    serviceIds,
    everyone: true,
    groupIds: [],
    cadence: "daily",
    time: "17:00",
    daysBefore: 1,
    weekdaysOnly: false,
    weekday: 5,
    weeksAhead: 1,
    active: true,
  };
}

export function scheduleToForm(s: ReleaseSchedule): ScheduleFormValues {
  return {
    name: s.name,
    serviceIds: [...s.serviceIds],
    everyone: s.everyone,
    groupIds: [...s.groupIds],
    cadence: s.cadence,
    time: s.time,
    daysBefore: s.daysBefore ?? 1,
    weekdaysOnly: s.weekdaysOnly,
    weekday: s.weekday ?? 5,
    weeksAhead: s.weeksAhead ?? 1,
    active: s.status === "active",
  };
}

/** Form values (validated) → the API body: the chosen cadence's settings only, groups only when not everyone. */
export function formToInput(v: ScheduleFormValues): ReleaseScheduleInput {
  const daily = v.cadence === "daily";
  return {
    name: v.name.trim(),
    serviceIds: [...v.serviceIds],
    everyone: v.everyone,
    groupIds: v.everyone ? [] : [...v.groupIds],
    cadence: v.cadence,
    time: v.time ?? "",
    daysBefore: daily ? v.daysBefore : null,
    weekdaysOnly: daily && v.weekdaysOnly,
    weekday: daily ? null : v.weekday,
    weeksAhead: daily ? null : v.weeksAhead,
    active: v.active,
  };
}
