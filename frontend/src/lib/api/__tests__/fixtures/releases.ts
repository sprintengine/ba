/** Release schedule fixtures (§21): a schedule each way, and a range of releases in every state. */
import type { Releases, ReleaseSchedule, ReleaseScheduleInput } from "@/lib/api/types";
import { ids } from "./ids";

export const releaseSchedule = {
  id: ids.releaseSchedule,
  name: "GMS next-day",
  serviceIds: [ids.service],
  everyone: false,
  groupIds: [ids.group],
  cadence: "daily",
  time: "17:00",
  daysBefore: 1,
  weekdaysOnly: true,
  weekday: null,
  weeksAhead: null,
  status: "active",
  createdAt: "2026-09-01T10:00:00+01:00",
  updatedAt: "2026-09-02T10:00:00+01:00",
} satisfies ReleaseSchedule;

/** Every nullable field null (the contract's sparse case; a real schedule sets the fields of its cadence). */
export const releaseScheduleSparse = {
  ...releaseSchedule,
  everyone: true,
  groupIds: [],
  cadence: "weekly",
  daysBefore: null,
  weekdaysOnly: false,
  weekday: null,
  weeksAhead: null,
  status: "paused",
} satisfies ReleaseSchedule;

export const releaseScheduleInput = {
  name: "GMS next-day",
  serviceIds: [ids.service],
  everyone: false,
  groupIds: [ids.group],
  cadence: "daily",
  time: "17:00",
  daysBefore: 1,
  weekdaysOnly: true,
  weekday: null,
  weeksAhead: null,
  active: true,
} satisfies ReleaseScheduleInput;

export const releases = {
  timezone: "Europe/Dublin",
  from: "2026-10-13",
  to: "2026-10-15",
  schedules: [
    {
      scheduleId: ids.releaseSchedule,
      name: "GMS next-day",
      days: [
        {
          date: "2026-10-13",
          scheduledAt: "2026-10-12T17:00:00+01:00",
          opensAt: "2026-10-12T17:00:00+01:00",
          state: "open",
          changed: false,
          changedBy: null,
          changedAt: null,
          times: 3,
        },
        {
          date: "2026-10-14",
          scheduledAt: "2026-10-13T17:00:00+01:00",
          opensAt: "2026-10-13T22:00:00+01:00",
          state: "moved",
          changed: true,
          changedBy: "Demo Owner",
          changedAt: "2026-10-13T16:12:00+01:00",
          times: 14,
        },
        {
          date: "2026-10-15",
          scheduledAt: "2026-10-14T17:00:00+01:00",
          opensAt: null,
          state: "held",
          changed: true,
          changedBy: null,
          changedAt: "2026-10-13T16:15:00+01:00",
          times: 0,
        },
      ],
    },
  ],
} satisfies Releases;
