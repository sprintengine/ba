import { api } from "./client";
import { businessPath, seg } from "./paths";
import type {
  DateRange,
  ReleaseChangeInput,
  Releases,
  ReleaseSchedule,
  ReleaseScheduleInput,
  ReleaseScope,
} from "./types";

/** Release schedules (§21): when days open for online booking. Owner/admin. */
export const releasesApi = {
  list: (businessId: string): Promise<ReleaseSchedule[]> =>
    api.get<ReleaseSchedule[]>(businessPath(businessId, "/release-schedules")),

  create: (businessId: string, body: ReleaseScheduleInput): Promise<ReleaseSchedule> =>
    api.post<ReleaseSchedule>(businessPath(businessId, "/release-schedules"), body),

  update: (businessId: string, scheduleId: string, body: ReleaseScheduleInput): Promise<ReleaseSchedule> =>
    api.put<ReleaseSchedule>(businessPath(businessId, `/release-schedules/${seg(scheduleId)}`), body),

  remove: (businessId: string, scheduleId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/release-schedules/${seg(scheduleId)}`)),

  /** Each active schedule's release of every day in `range` (at most 31 days). */
  releases: (businessId: string, range: DateRange): Promise<Releases> =>
    api.get<Releases>(businessPath(businessId, "/releases"), { from: range.from, to: range.to }),

  /** Opens one release now, moves it or holds it. */
  change: (
    businessId: string,
    scheduleId: string,
    date: string,
    body: ReleaseChangeInput,
  ): Promise<Releases> =>
    api.put<Releases>(
      businessPath(businessId, `/release-schedules/${seg(scheduleId)}/changes/${seg(date)}`),
      body,
    ),

  /** Puts one release back on schedule. */
  reset: (
    businessId: string,
    scheduleId: string,
    date: string,
    scope: ReleaseScope = "release",
  ): Promise<Releases> =>
    api.delete<Releases>(
      businessPath(businessId, `/release-schedules/${seg(scheduleId)}/changes/${seg(date)}`),
      {
        query: { scope },
      },
    ),
};
