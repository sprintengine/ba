/** API types: Release schedules (§21). Import them from `@/lib/api/types`. */

export type ReleaseCadence = "daily" | "weekly";

/** A schedule as the owner writes it. */
export type ReleaseScheduleInput = {
  name: string;
  serviceIds: string[];
  /** True: every customer. False: the customers in `groupIds`. */
  everyone: boolean;
  groupIds: string[];
  cadence: ReleaseCadence;
  /** `HH:mm` in the business timezone. */
  time: string;
  /** Daily: open each day this many days before it (0–14). */
  daysBefore: number | null;
  /** Daily: a release that falls on a Saturday or Sunday happens on the Friday before. */
  weekdaysOnly: boolean;
  /** Weekly: the release day, ISO (Monday = 1). */
  weekday: number | null;
  /** Weekly: how many weeks before a week (Monday to Sunday) it opens (1–4). */
  weeksAhead: number | null;
  active: boolean;
};

export type ReleaseSchedule = Omit<ReleaseScheduleInput, "active"> & {
  id: string;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

export type ReleaseAction = "open_now" | "move" | "hold";
/** `release`: every day the schedule opens at the same moment (a week, a weekend). `day`: just that date. */
export type ReleaseScope = "release" | "day";

export type ReleaseChangeInput = {
  action: ReleaseAction;
  /** For `move`: ISO instant, before the day ends. */
  opensAt?: string | null;
  scope?: ReleaseScope;
};

/** Where a day's release stands: open, not yet (on schedule or at a changed time), or held until someone opens it. */
export type ReleaseState = "open" | "scheduled" | "moved" | "held";

export type ReleaseDay = {
  /** `YYYY-MM-DD` */
  date: string;
  /** When the schedule opens the day (ISO instant). */
  scheduledAt: string;
  /** When it opens with any change applied; null when held. */
  opensAt: string | null;
  state: ReleaseState;
  /** A change moved, held or opened this day. */
  changed: boolean;
  changedBy: string | null;
  changedAt: string | null;
  /** Distinct free start times the release opens (or opened) for the schedule's customers. */
  times: number;
};

export type ScheduleReleases = { scheduleId: string; name: string; days: ReleaseDay[] };

export type Releases = {
  timezone: string;
  /** `YYYY-MM-DD` */
  from: string;
  /** `YYYY-MM-DD` */
  to: string;
  schedules: ScheduleReleases[];
};
