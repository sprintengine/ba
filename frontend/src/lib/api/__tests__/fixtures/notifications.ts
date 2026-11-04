/** Notifications (§22) and customers' AI app requests (§20.8). */
import type {
  AppNotification,
  CustomerAgentRequest,
  CustomerAgentSettings,
  NotificationSettings,
  PushDevice,
  PushDeviceInput,
} from "@/lib/api/types";
import { assistantAction, assistantActionSparse } from "./assistant";

export const notification = {
  id: "00000000-0000-4000-8000-0000000000b0",
  kind: "agent_approval",
  title: "Claude wants to: Cancel 1 appointment",
  body: "Rowan Hale, Tue 6 Oct, 13:00",
  link: "/dashboard/lumen-physio/approvals/00000000-0000-4000-8000-0000000000a0",
  businessName: "Lumen Physiotherapy",
  createdAt: "2026-10-01T10:00:00Z",
  read: false,
} satisfies AppNotification;

export const notificationSparse = {
  ...notification,
  body: null,
  businessName: null,
} satisfies AppNotification;

export const notificationSettings = {
  items: [
    {
      kind: "new_booking",
      label: "New bookings",
      description: "A customer booked online or through their AI assistant.",
      email: false,
      forMembers: true,
      forCustomers: false,
    },
  ],
} satisfies NotificationSettings;

export const customerAgentRequest = {
  action: assistantAction,
  app: "Claude",
  business: { name: "Lumen Physiotherapy", slug: "lumen-physio" },
  timezone: "Europe/Dublin",
  needsApproval: true,
  appDisconnected: false,
} satisfies CustomerAgentRequest;

export const customerAgentRequestSparse = {
  ...customerAgentRequest,
  action: assistantActionSparse,
} satisfies CustomerAgentRequest;

export const customerAgentSettings = { autoApprove: ["bookings"] } satisfies CustomerAgentSettings;

export const pushDevice = {
  id: "00000000-0000-4000-8000-0000000000c0",
  platform: "ios",
  appVariant: "production",
  createdAt: "2026-10-01T10:00:00Z",
  lastSeenAt: "2026-10-02T08:30:00Z",
} satisfies PushDevice;

export const pushDeviceInput = {
  token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  platform: "android",
  appVariant: "preview",
} satisfies PushDeviceInput;
