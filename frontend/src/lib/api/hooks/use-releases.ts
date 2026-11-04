"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { releasesApi } from "../releases";
import type {
  DateRange,
  ReleaseChangeInput,
  Releases,
  ReleaseSchedule,
  ReleaseScheduleInput,
  ReleaseScope,
} from "../types";
import {
  enabledWhen,
  invalidateAll,
  replaceInList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

export function useReleaseSchedules(businessId: string, options?: QueryOptions<ReleaseSchedule[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).releaseSchedules(),
    queryFn: () => releasesApi.list(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/**
 * Each active schedule's release of every day in `range` (null: no request). The previous range stays visible while
 * the next loads, so the calendar's release row doesn't flash when paging weeks. Days open on their own: screens show
 * them through `liveDay`, and the data (free times, other people's changes) refreshes every five minutes.
 */
export function useReleases(businessId: string, range: DateRange | null, options?: QueryOptions<Releases>) {
  return useQuery({
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
    ...options,
    queryKey: qk.business(businessId).releases(range ?? { from: "", to: "" }),
    queryFn: () => releasesApi.releases(businessId, range!),
    enabled: enabledWhen(!!businessId && range != null, options),
  });
}

/**
 * Schedules and their changes decide which days customers can book: refresh the schedules, the releases, staff
 * availability (its customer view), public availability and the marketplace.
 */
function afterReleaseChange(businessId: string) {
  return (qc: QueryClient, schedule?: ReleaseSchedule) => {
    const b = qk.business(businessId);
    if (schedule) replaceInList(qc, b.releaseSchedules(), schedule);
    return invalidateAll(qc, [
      b.releaseSchedules(),
      b.releasesAll(),
      b.availabilityAll(),
      qk.public.all(),
      qk.marketplace.all(),
    ]);
  };
}

export function useCreateReleaseSchedule(
  businessId: string,
  options?: MutationOptions<ReleaseSchedule, ReleaseScheduleInput>,
) {
  return useApiMutation(
    (input: ReleaseScheduleInput) => releasesApi.create(businessId, input),
    afterReleaseChange(businessId),
    options,
  );
}

export type UpdateReleaseScheduleVariables = { id: string; input: ReleaseScheduleInput };

export function useUpdateReleaseSchedule(
  businessId: string,
  options?: MutationOptions<ReleaseSchedule, UpdateReleaseScheduleVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateReleaseScheduleVariables) => releasesApi.update(businessId, id, input),
    afterReleaseChange(businessId),
    options,
  );
}

/** Variables: the schedule id. */
export function useDeleteReleaseSchedule(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => releasesApi.remove(businessId, id),
    (qc) => afterReleaseChange(businessId)(qc),
    options,
  );
}

export type ChangeReleaseVariables = { scheduleId: string; date: string; input: ReleaseChangeInput };

/** Opens one release now, moves it or holds it. */
export function useChangeRelease(
  businessId: string,
  options?: MutationOptions<Releases, ChangeReleaseVariables>,
) {
  return useApiMutation(
    ({ scheduleId, date, input }: ChangeReleaseVariables) =>
      releasesApi.change(businessId, scheduleId, date, input),
    (qc) => afterReleaseChange(businessId)(qc),
    options,
  );
}

export type ResetReleaseVariables = { scheduleId: string; date: string; scope?: ReleaseScope };

/** Puts one release back on schedule. */
export function useResetRelease(
  businessId: string,
  options?: MutationOptions<Releases, ResetReleaseVariables>,
) {
  return useApiMutation(
    ({ scheduleId, date, scope }: ResetReleaseVariables) =>
      releasesApi.reset(businessId, scheduleId, date, scope),
    (qc) => afterReleaseChange(businessId)(qc),
    options,
  );
}
