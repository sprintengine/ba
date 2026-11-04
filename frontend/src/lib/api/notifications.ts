import { api } from "./client";
import { seg } from "./paths";
import type {
  CustomerAgentRequest,
  CustomerAgentSettings,
  CustomerAutoApprove,
  NotificationKind,
  NotificationList,
  NotificationSettings,
  PushDevice,
  PushDeviceInput,
} from "./types";

/** The signed-in person's notifications (§22) and their own AI apps' requests (§20.8). */
export const notificationsApi = {
  list: (): Promise<NotificationList> => api.get<NotificationList>("/v1/me/notifications"),

  read: (id: string): Promise<void> => api.post<undefined>(`/v1/me/notifications/${seg(id)}/read`),

  readAll: (): Promise<void> => api.post<undefined>("/v1/me/notifications/read-all"),

  settings: (): Promise<NotificationSettings> =>
    api.get<NotificationSettings>("/v1/me/notification-settings"),

  /** Kinds to email (or not); kinds left out are unchanged. */
  updateSettings: (email: Partial<Record<NotificationKind, boolean>>): Promise<NotificationSettings> =>
    api.patch<NotificationSettings>("/v1/me/notification-settings", { email }),

  agentRequests: (): Promise<CustomerAgentRequest[]> =>
    api.get<{ items: CustomerAgentRequest[] }>("/v1/me/agent-requests").then((r) => r.items),

  agentRequest: (id: string): Promise<CustomerAgentRequest> =>
    api.get<CustomerAgentRequest>(`/v1/me/agent-requests/${seg(id)}`),

  approveAgentRequest: (id: string): Promise<CustomerAgentRequest> =>
    api.post<CustomerAgentRequest>(`/v1/me/agent-requests/${seg(id)}/approve`),

  declineAgentRequest: (id: string): Promise<CustomerAgentRequest> =>
    api.post<CustomerAgentRequest>(`/v1/me/agent-requests/${seg(id)}/decline`),

  agentSettings: (): Promise<CustomerAgentSettings> =>
    api.get<CustomerAgentSettings>("/v1/me/agent-settings"),

  updateAgentSettings: (autoApprove: CustomerAutoApprove[]): Promise<CustomerAgentSettings> =>
    api.patch<CustomerAgentSettings>("/v1/me/agent-settings", { autoApprove }),

  /** Push notifications to this device (the mobile app, after sign-in); registering a known token refreshes it. */
  registerPushDevice: (input: PushDeviceInput): Promise<PushDevice> =>
    api.post<PushDevice>("/v1/me/push-devices", input),

  /** Stops pushing to this device (sign-out). */
  unregisterPushDevice: (token: string): Promise<void> =>
    api.delete("/v1/me/push-devices", { body: { token } }),
};
