import type { AssistantAction } from "../assistant-schema";

/** The kinds of notification (§22). */
export type NotificationKind =
  "agent_approval" | "booking_request" | "new_booking" | "booking_cancelled" | "booking_moved";

/** One of the signed-in person's notifications (the bell). */
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** App path to open, e.g. `/dashboard/lumen-physio/approvals/<id>`. */
  link: string;
  /** The business it is about, if any. */
  businessName: string | null;
  /** ISO-8601 instant (UTC). */
  createdAt: string;
  read: boolean;
};

export type NotificationList = { items: AppNotification[]; unreadCount: number };

export type NotificationSetting = {
  kind: NotificationKind;
  label: string;
  description: string;
  /** Also emailed (always shown in the app). */
  email: boolean;
  forMembers: boolean;
  forCustomers: boolean;
};

export type NotificationSettings = { items: NotificationSetting[] };

/** One of a customer's AI apps' requests (`/me/agent-requests`, §20.8), in the shape of a business proposal. */
export type CustomerAgentRequest = {
  /** Result links are app paths or full URLs (e.g. a payment page). */
  action: AssistantAction;
  app: string;
  business: { name: string; slug: string };
  /** The business's timezone: the times are in it. */
  timezone: string;
  needsApproval: boolean;
  appDisconnected: boolean;
};

/** Kinds of change a customer lets their AI apps make once the app confirms them. */
export type CustomerAutoApprove = "bookings" | "cancellations";

export type CustomerAgentSettings = { autoApprove: CustomerAutoApprove[] };

/** The platform of a device that gets push notifications. */
export type PushPlatform = "ios" | "android";

/** The mobile app build that registered a device: each has its own bundle id, so its own push credentials. */
export type PushAppVariant = "development" | "preview" | "production";

/**
 * `POST /me/push-devices`: this phone gets the signed-in person's notifications (registering again refreshes it).
 * `token` is the Expo push token (`ExponentPushToken[…]`, from `getExpoPushTokenAsync`).
 */
export type PushDeviceInput = { token: string; platform: PushPlatform; appVariant: PushAppVariant };

/** A registered device (the token itself is not returned). */
export type PushDevice = {
  id: string;
  platform: PushPlatform;
  appVariant: PushAppVariant;
  /** ISO-8601 instant (UTC). */
  createdAt: string;
  /** ISO-8601 instant (UTC): when the app last registered it. */
  lastSeenAt: string;
};
