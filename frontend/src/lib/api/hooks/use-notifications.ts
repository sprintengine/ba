"use client";

import { useQuery } from "@tanstack/react-query";
import { notificationsApi } from "../notifications";
import { qk } from "../query-keys";
import type {
  CustomerAgentRequest,
  CustomerAgentSettings,
  CustomerAutoApprove,
  NotificationKind,
  NotificationList,
  NotificationSettings,
  PushDevice,
  PushDeviceInput,
} from "../types";
import { invalidateAll, useApiMutation, type MutationOptions, type QueryOptions } from "./shared";

/** How often the bell checks for news while the page is open (and on focus). */
export const NOTIFICATIONS_POLL_MS = 30_000;

/** The bell: recent notifications and the unread count, refreshed every half minute and when the tab regains focus. */
export function useNotifications(options?: QueryOptions<NotificationList>) {
  return useQuery({
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchOnWindowFocus: true,
    ...options,
    queryKey: qk.notifications(),
    queryFn: () => notificationsApi.list(),
  });
}

/** Variables: the notification id. Updates the bell straight away. */
export function useMarkNotificationRead(options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => notificationsApi.read(id),
    (qc, _data, id) => {
      qc.setQueryData<NotificationList>(qk.notifications(), (list) => {
        if (!list) return list;
        const wasUnread = list.items.some((n) => n.id === id && !n.read);
        return {
          items: list.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, list.unreadCount - (wasUnread ? 1 : 0)),
        };
      });
    },
    options,
  );
}

export function useMarkAllNotificationsRead(options?: MutationOptions<void, void>) {
  return useApiMutation(
    () => notificationsApi.readAll(),
    (qc) => {
      qc.setQueryData<NotificationList>(
        qk.notifications(),
        (list) => list && { items: list.items.map((n) => ({ ...n, read: true })), unreadCount: 0 },
      );
    },
    options,
  );
}

export function useNotificationSettings(options?: QueryOptions<NotificationSettings>) {
  return useQuery({
    ...options,
    queryKey: qk.notificationSettings(),
    queryFn: () => notificationsApi.settings(),
  });
}

export function useUpdateNotificationSettings(
  options?: MutationOptions<NotificationSettings, Partial<Record<NotificationKind, boolean>>>,
) {
  return useApiMutation(
    (email: Partial<Record<NotificationKind, boolean>>) => notificationsApi.updateSettings(email),
    (qc, settings) => {
      qc.setQueryData(qk.notificationSettings(), settings);
    },
    options,
  );
}

/** The customer's own AI apps' requests of the last week (§20.8). */
export function useMyAgentRequests(options?: QueryOptions<CustomerAgentRequest[]>) {
  return useQuery({
    ...options,
    queryKey: qk.myAgentRequests(),
    queryFn: () => notificationsApi.agentRequests(),
  });
}

export function useMyAgentRequest(id: string, options?: QueryOptions<CustomerAgentRequest>) {
  return useQuery({
    ...options,
    queryKey: qk.myAgentRequest(id),
    queryFn: () => notificationsApi.agentRequest(id),
    enabled: options?.enabled ?? !!id,
  });
}

/** Approves (carries out) one: bookings change, and so does the bell. */
export function useApproveMyAgentRequest(options?: MutationOptions<CustomerAgentRequest, string>) {
  return useApiMutation(
    (id: string) => notificationsApi.approveAgentRequest(id),
    (qc, request) => {
      qc.setQueryData(qk.myAgentRequest(request.action.id), request);
      void invalidateAll(qc, [qk.myAgentRequests(), qk.myBookings(), qk.notifications()]);
    },
    options,
  );
}

export function useDeclineMyAgentRequest(options?: MutationOptions<CustomerAgentRequest, string>) {
  return useApiMutation(
    (id: string) => notificationsApi.declineAgentRequest(id),
    (qc, request) => {
      qc.setQueryData(qk.myAgentRequest(request.action.id), request);
      return invalidateAll(qc, [qk.myAgentRequests(), qk.notifications()]);
    },
    options,
  );
}

export function useMyAgentSettings(options?: QueryOptions<CustomerAgentSettings>) {
  return useQuery({
    ...options,
    queryKey: qk.myAgentSettings(),
    queryFn: () => notificationsApi.agentSettings(),
  });
}

export function useUpdateMyAgentSettings(
  options?: MutationOptions<CustomerAgentSettings, CustomerAutoApprove[]>,
) {
  return useApiMutation(
    (autoApprove: CustomerAutoApprove[]) => notificationsApi.updateAgentSettings(autoApprove),
    (qc, settings) => {
      qc.setQueryData(qk.myAgentSettings(), settings);
    },
    options,
  );
}

/** The mobile app registers its push token after sign-in (and again when it changes). No cached data changes. */
export function useRegisterPushDevice(options?: MutationOptions<PushDevice, PushDeviceInput>) {
  return useApiMutation(
    (input: PushDeviceInput) => notificationsApi.registerPushDevice(input),
    undefined,
    options,
  );
}

/** Variables: the device's push token. The mobile app unregisters it on sign-out. */
export function useUnregisterPushDevice(options?: MutationOptions<void, string>) {
  return useApiMutation((token: string) => notificationsApi.unregisterPushDevice(token), undefined, options);
}
